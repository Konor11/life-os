#!/usr/bin/env python3
"""«Живой второй мозг»: индекс разговоров с агентами.

Зачем: заметки в панели заводятся руками, а знания рождаются в диалогах. Этот скрипт читает
историю Hermes (SQLite state.db) и строит из неё то, чего в панели не было: перечень разговоров,
темы, связи между ними и черновики заметок с источником.

Что читаем: /root/.hermes/state.db и /root/.hermes/profiles/*/state.db. Только на чтение — пишет
в базу движок. Роли 'tool' пропускаем: это 22 тысячи служебных сообщений, в знаниях они не нужны.
Командные сообщения Hermes пишутся в content с префиксом строки инструмента — обрезаем по '.'

Подкоманды:
  index           собрать индекс (сессии, темы, связи, черновики заметок) → JSON в stdout
  search <q>      полнотекстовый поиск по всем диалогам (роли user/assistant)
  session <id>    сообщения одного разговора — «переход к источнику»

Заметки выводятся детерминированно (id = хеш содержимого), поэтому повторный запуск не создаёт
дублей, а источник в заметке всегда указывает на конкретный диалог и сообщение.
"""
import glob
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict

ROLES = ("user", "assistant")
MIN_LEN = 60            # короче — usually «ок», «да», «продолжай»
MAX_INDEX_CHARS = 1400  # в индекс кладём обрезок, полный текст остаётся в базе
MAX_NOTE_CHARS = 1200
MAX_NOTES = 200

# Стоп-слова: русские и английские служебные. Без них «темы» были бы словами вроде «это» и «как».
STOP = set("""
это как что так но или если же то все всё они она он мы вы их на не за по из от до для про при без
быть был была были быть будет можно нужно надо может хочу хотел дай сделай сделано готово вот там
здесь теперь тогда тоже только ещё еще уже очень мой моя мои твой ваш наш ваш его ее её их себя
себе который которая которые был стал стать есть нет не нету ок окей хорошо спасибо ага угу привет
скажи сказал говорить вопрос ответ тема вопросы также кроме между через после перед более менее сам
сама само самый кажется кажется выглядит значит итак иначе потому поэтому чтобы чтоб ли
the and for you your are was that this with have has not but all can will from they them their there
here what when which who how why did does done just like need want more some any into out about
also very much then than been being were our us your yours ok okay yes yeah right sure
""".split())


# Каталог с историей Hermes. По умолчанию — тот, где работает движок. Переопределяется переменной
# окружения LIFEOS_HERMES_HOME: Life OS может стоять на одном хосте, а разговаривать с агентами
# можно с другого (история лежит там), и наоборот. Без этого индекс видел бы пустую базу.
HERMES_HOME = os.environ.get("LIFEOS_HERMES_HOME", "/root/.hermes")


def db_paths():
    """Все базы истории: основная + по профилям (флот тоже обсуждает дела)."""
    out = [os.path.join(HERMES_HOME, "state.db")]
    out += sorted(glob.glob(os.path.join(HERMES_HOME, "profiles", "*", "state.db")))
    return [p for p in out if os.path.exists(p)]


def profile_of(path):
    marker = os.path.join(HERMES_HOME, "profiles") + os.sep
    if marker in path:
        return path.split(marker)[1].split(os.sep)[0]
    return "default"


def connect(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
    con.row_factory = sqlite3.Row
    return con


def clean_text(raw):
    """Чистим текст сообщения Hermes.

    Команда '/продолжай' хранится как 'Продолжай' после служебных префиксов, а вывод инструментов
    приходит блоками. Для знаний берём только осмысленный текст и не даём индексу разрастись.
    """
    t = raw or ""
    t = t.replace("\r", "\n")
    # Служебные пометки Hermes: [System note: ...], [Context: ...]
    t = re.sub(r"\[(System note|Context|Instruction)[^\]]*\]:?\s*", "", t)
    t = re.sub(r"<(system|user|assistant)[^>]*>", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    # Служебные врезки Hermes про сжатие контекста — не знание, а шум выдачи.
    if "CONTEXT COMPACTION" in t:
        return ""
    return t.strip()


def clean_title(raw, fallback):
    """Заголовок сессии иногда приходит JSON-обломком — берём читаемую часть."""
    t = (raw or "").strip()
    if t.startswith("{") or t.startswith("["):
        m = re.search(r'"title"\s*:\s*"([^"]{3,120})"', t)
        if m:
            t = m.group(1)
        else:
            t = ""
    t = t.replace("\n", " ").strip(' "\'')
    return t or fallback


def tokens(text):
    raw = re.findall(r"[a-zA-Zа-яА-ЯёЁ][a-zA-Zа-яА-ЯёЁ0-9_-]{2,}", (text or "").lower())
    return [w for w in raw if w not in STOP and not w.isdigit() and len(w) > 2]


def snippet(text, n=220):
    t = re.sub(r"\s+", " ", (text or "").strip())
    return t[:n] + ("…" if len(t) > n else "")


# ------------------------------------------------------------------ сбор данных ----

def collect():
    """Читает все базы и отдаёт сессии с сообщениями (без tool)."""
    sessions = []
    for path in db_paths():
        prof = profile_of(path)
        try:
            con = connect(path)
        except Exception:
            continue
        try:
            srows = con.execute(
                "select id, source, title, message_count, started_at, last_activity_at, model "
                "from sessions order by coalesce(last_activity_at, started_at) desc").fetchall()
        except Exception:
            con.close()
            continue
        for s in srows:
            try:
                # ВНИМАНИЕ: фильтра по active = 1 быть не должно. Этот флаг означает «входит в
                # текущее окно контекста», а не «валидно»: у 21901 из 24055 сообщений агента он
                # равен 0, потому что сессия была сжата (compacted=1), и текст там полноценный.
                # С таким фильтром мы молча теряли 90% истории.
                mrows = con.execute(
                    "select id, role, content, timestamp from messages "
                    "where session_id = ? and role in (?, ?) "
                    "and content is not null and length(content) between ? and 60000",
                    (s["id"], ROLES[0], ROLES[1], MIN_LEN)).fetchall()
            except Exception:
                mrows = []
            msgs = []
            kept = 0
            for m in mrows:
                body = clean_text(m["content"])
                if len(body) < MIN_LEN:
                    continue
                # Для тем и заметок хватает первых 60 сообщений на разговор. Сам текст в индекс не
                # идёт: поиск и просмотр диалога читают базу напрямую, иначе индекс весил бы
                # десятки мегабайт и каждая правка заметки его бы переписывала.
                if kept < 60:
                    msgs.append({
                        "id": m["id"],
                        "role": m["role"],
                        "text": body[:MAX_INDEX_CHARS],
                        "ts": m["timestamp"],
                    })
                    kept += 1
            all_count = sum(1 for _ in mrows)
            # Разговор без содержательных сообщений (инструменты, «ок») в знаниях не нужен
            if not msgs:
                continue
            sessions.append({
                "id": s["id"],
                "profile": prof,
                "source": s["source"] or "unknown",
                "title": clean_title(s["title"], "Разговор " + s["id"][:8]),
                "started_at": s["started_at"],
                "last_activity_at": s["last_activity_at"] or s["started_at"],
                "messageCount": s["message_count"] or all_count,
                "indexed": len(msgs),
                "model": s["model"],
                "messages": msgs,
            })
        con.close()
    sessions.sort(key=lambda x: -(x["last_activity_at"] or 0))
    return sessions


# ---------------------------------------------------------------------- темы ----

def build_topics(sessions, per_session=6, top_n=40):
    """Темы = частые содержательные слова; по каждой — где обсуждались."""
    by_topic = defaultdict(lambda: {"sessions": [], "mentions": 0})
    for s in sessions:
        text = " ".join(m["text"] for m in s["messages"][:120]) + " " + s["title"]
        counter = Counter(tokens(text))
        for w, n in counter.most_common(per_session * 2):
            if n < 2:
                continue
            slot = by_topic[w]
            slot["mentions"] += n
            if len(slot["sessions"]) < 12:
                slot["sessions"].append(s["id"])
    topics = []
    for w, v in by_topic.items():
        if len(w) < 4 and not w.isascii():
            continue
        topics.append({"topic": w, "mentions": v["mentions"], "sessions": v["sessions"]})
    topics.sort(key=lambda t: -t["mentions"])
    return topics[:top_n]


def build_relations(sessions, topics, min_shared=2, per_session=5):
    """Связи между разговорами: обсуждали одно и то же."""
    topic_sessions = defaultdict(set)
    for t in topics:
        for sid in t["sessions"]:
            topic_sessions[sid].add(t["topic"])
    by_id = {s["id"]: s for s in sessions}
    out = []
    for sid, tops in topic_sessions.items():
        related = []
        for other, otops in topic_sessions.items():
            if other == sid:
                continue
            shared = tops & otops
            if len(shared) >= min_shared:
                related.append({"id": other, "shared": sorted(shared)[:5], "weight": len(shared)})
        if related:
            related.sort(key=lambda r: -r["weight"])
            out.append({
                "id": sid,
                "title": by_id[sid]["title"],
                "related": related[:per_session],
            })
    return out


# ------------------------------------------------------------ черновики заметок ----

# Маркеры выводов/решений: такие сообщения и есть носители знаний.
NOTE_MARKERS = (
    "готово", "исправил", "исправлено", "сделал", "сделано", "работает", "итог", "решили", "решил",
    "вывод", "план", "проверил", "проверено", "причина", "оказалось", "теперь", "добавил", "изменил",
    "схема", "настроил", "починил", "тест", "проверка", "работает как", "заменил", "убрал",
)
NOTE_START_OK = re.compile(
    r"^(заказчик|вот|итого|итог|вывод|план|результат|решили|сделал|исправил|настроил|починил|добавил|"
    r"проверил|работает|теперь|причина|оказалось|сегодня|короче|готово|ок,|- |\* |1\.|2\.)",
    re.I)


def note_candidates(sessions, limit=MAX_NOTES):
    """Отбираем сообщения-выводы. Правила намеренно простые и объяснены пользователю:
    длина, маркеры выводов и начало фразы. Слишком умная эвристика молчала бы об упущенном."""
    picked = []
    seen = set()
    for s in sessions:
        # Только содержательные ответы агента, и не самые древние сессии
        for m in s["messages"]:
            if m["role"] != "assistant":
                continue
            t = m["text"].strip()
            if not (250 <= len(t) <= 4000):
                continue
            low = t.lower()
            if not any(k in low for k in NOTE_MARKERS):
                continue
            if not NOTE_START_OK.match(t):
                continue
            h = hashlib.sha1(t[:400].encode("utf-8")).hexdigest()[:12]
            if h in seen:
                continue
            seen.add(h)
            picked.append({
                # Детерминированный id: повторный индекс не плодит дубли
                "id": f"ln-{h}",
                "title": snippet(t, 70),
                "content": t[:MAX_NOTE_CHARS],
                "source": {
                    "sessionId": s["id"],
                    "sessionTitle": s["title"],
                    "messageId": m["id"],
                    "role": m["role"],
                    "ts": m["ts"],
                    "profile": s["profile"],
                    "source": s["source"],
                },
                "tags": [],
                "created": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(m["ts"] or 0)),
                "auto": True,
            })
            if len(picked) >= limit:
                return picked
    return picked


# -------------------------------------------------------------------- команды ----

def do_index():
    sessions = collect()
    topics = build_topics(sessions)
    relations = build_relations(sessions, topics)
    notes = note_candidates(sessions)
    by_source = Counter(s["source"] for s in sessions)
    out = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "stats": {
            "sessions": len(sessions),
            # Полное число сообщений в разговорах и отдельно то, что попало в индекс
            # (по 60 на разговор) — чтобы не выдавать одно за другое.
            "messages": sum(s["messageCount"] or 0 for s in sessions),
            "messagesIndexed": sum(len(s["messages"]) for s in sessions),
            "notes": len(notes),
            "topics": len(topics),
            "relations": len(relations),
            "bySource": dict(by_source),
        },
        "sessions": [
            {k: v for k, v in s.items() if k != "messages"} | {"messageCountIndexed": len(s["messages"])}
            for s in sessions
        ],
        "topics": topics,
        "relations": relations,
        "notes": notes,
    }
    print(json.dumps(out, ensure_ascii=False))


def do_search(query, limit=30):
    q = (query or "").strip()
    if len(q) < 2:
        print(json.dumps({"query": q, "results": []}, ensure_ascii=False))
        return
    # Ищем по всем словам запроса (AND). LIKE по подстроке: 0.15 с на 49k строк, а FTS5 с
    # trigram-токенизатором на русском требует ≥3 символов и капризничает на коротких словах.
    words = [w for w in re.findall(r"[\wа-яА-ЯёЁ-]{2,}", q)][:6]
    where = " and ".join(["m.content like ?"] * len(words))
    args = [f"%{w}%" for w in words]
    hits = []
    for path in db_paths():
        prof = profile_of(path)
        try:
            con = connect(path)
            sess = {r["id"]: r for r in con.execute(
                "select id, source, title, started_at from sessions")}
            rows = con.execute(
                f"select m.id, m.session_id, m.role, m.content, m.timestamp from messages m "
                f"where m.role in ('user','assistant') and {where} "
                f"order by m.timestamp desc limit ?", (*args, limit * 2)).fetchall()
            for r in rows:
                s = sess.get(r["session_id"])
                body = clean_text(r["content"])
                if len(body) < MIN_LEN:
                    continue
                hits.append({
                    "messageId": r["id"],
                    "sessionId": r["session_id"],
                    "sessionTitle": clean_title(s["title"] if s else "", "Разговор"),
                    "role": r["role"],
                    "ts": r["timestamp"],
                    "profile": prof,
                    "source": (s["source"] if s else "unknown"),
                    "snippet": snippet(body, 300),
                })
        except Exception as e:
            sys.stderr.write(f"[lbrain] поиск в {path}: {e}\n")
        finally:
            if con is not None:
                try:
                    con.close()
                except Exception:
                    pass
    hits.sort(key=lambda h: -(h["ts"] or 0))
    print(json.dumps({"query": q, "results": hits[:limit]}, ensure_ascii=False))


def do_session(session_id, limit=200):
    out = {"sessionId": session_id, "found": False, "messages": []}
    for path in db_paths():
        con = None
        try:
            con = connect(path)
            s = con.execute("select id, source, title, started_at, model from sessions where id = ?",
                            (session_id,)).fetchone()
            if not s:
                con.close()
                continue
            rows = con.execute(
                "select id, role, content, timestamp from messages where session_id = ? "
                "and role in ('user','assistant') order by timestamp asc limit ?",
                (session_id, limit)).fetchall()
            out = {
                "found": True,
                "sessionId": session_id,
                "profile": profile_of(path),
                "source": s["source"],
                "title": clean_title(s["title"], "Разговор " + session_id[:8]),
                "startedAt": s["started_at"],
                "model": s["model"],
                "messages": [{
                    "id": r["id"], "role": r["role"],
                    "text": clean_text(r["content"])[:MAX_INDEX_CHARS],
                    "ts": r["timestamp"],
                } for r in rows],
            }
            con.close()
            break
        except Exception as e:
            sys.stderr.write(f"[lbrain] сессия {session_id}: {e}\n")
            if con is not None:
                try:
                    con.close()
                except Exception:
                    pass
    print(json.dumps(out, ensure_ascii=False))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "index"
    if cmd == "index":
        do_index()
    elif cmd == "search":
        do_search(sys.argv[2] if len(sys.argv) > 2 else "",
                   int(sys.argv[3]) if len(sys.argv) > 3 else 30)
    elif cmd == "session":
        do_session(sys.argv[2] if len(sys.argv) > 2 else "")
    else:
        sys.stderr.write("команды: index | search <q> [limit] | session <id>\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
