#!/usr/bin/env python3
"""Адаптер истории движка для ленты чата в панели.

Приём из AgentDeck (AliceLJY/cc-remote-term): транспорт терминала агент-агностик (PTY + xterm),
а «понимание» даёт адаптер — он знает, ГДЕ конкретный движок хранит историю, и умеет отдать её
структурой. У Hermes это SQLite: ~/.hermes/state.db, таблицы sessions (source='tui') и messages
(role/content/timestamp). База открывается ТОЛЬКО на чтение: пишет в неё движок, не мы.
"""
import argparse
import json
import os
import sqlite3
import sys

TOOL_PREVIEW = 400


def home_for(profile):
    if profile and profile != 'default':
        return f'/root/.hermes/profiles/{profile}'
    return '/root/.hermes'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profile', default='default')
    ap.add_argument('--session', default='')
    ap.add_argument('--limit', type=int, default=80)
    args = ap.parse_args()

    db = os.path.join(home_for(args.profile), 'state.db')
    if not os.path.exists(db):
        print(json.dumps({'ok': False, 'error': f'нет базы истории: {db}'}))
        return 0
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True, timeout=3)
        con.row_factory = sqlite3.Row
        sid = args.session
        if not sid:
            row = con.execute(
                "select id from sessions where source = 'tui' order by rowid desc limit 1").fetchone()
            if row:
                sid = row['id']
        if not sid:
            print(json.dumps({'ok': True, 'session': None, 'messages': []}))
            return 0
        rows = con.execute(
            'select id, role, content, tool_name, tool_calls, timestamp from messages '
            'where session_id = ? order by id', (sid,)).fetchall()
        msgs = []
        for r in rows:
            role = r['role'] or 'assistant'
            text = r['content'] or ''
            if not text and r['tool_calls']:
                text = '⚙ ' + str(r['tool_calls'])[:TOOL_PREVIEW]
            msgs.append({
                'id': r['id'],
                'role': role,
                'tool': r['tool_name'] or '',
                'text': text,
                'ts': r['timestamp'],
            })
        if args.limit and len(msgs) > args.limit:
            msgs = msgs[-args.limit:]
        print(json.dumps({'ok': True, 'session': sid, 'messages': msgs}, ensure_ascii=False))
    except Exception as e:  # база занята движком, нет таблиц и т. п. — говорим как есть
        print(json.dumps({'ok': False, 'error': str(e)}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
