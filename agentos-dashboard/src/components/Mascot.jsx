// Маскот Life OS — «Робот-питомец» (выбран 2026-09-29).
//
// Один и тот же персонаж в трёх местах интерфейса: шапка, экран загрузки и окно входа.
// Рисуется инлайновым SVG (без файлов и запросов) и наследует цвет акцента панели:
// градиент задаётся через currentColor, поэтому в светлой и тёмной темах знак одинаковый.
//
// Проп `state` меняет «настроение» — экрану глаз (иконка статуса агента) и «весёлый» рот:
//   'idle'   — обычный, круглые глаза
//   'work'   — работает, прищур (дуги) вместо круглых глаз
//   'sleep'  — спит, глаза-щёлки и приглушённая антенна
//   'ok'     — зелёные глаза, довольный
//   'error'  — красные глаза, встревожен
export function Mascot({ size = 28, className = '', state = 'idle', title }) {
  // Константы держим ЗДЕСЬ: на прототипе маскота они жили в <script> листа, и ссылка на них
  // из модуля роняла весь рендер страницы («CY is not defined» — пустой экран).
  const CY = '#22d3ee'
  const eye = { idle: CY, ok: '#34d399', error: '#f87171', work: CY, sleep: '#94a3b8' }[state] || CY
  const round = state === 'idle' || state === 'ok' || state === 'error'
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="lifeos-mascot-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="var(--cx-accent-hover, #8b5cf6)" />
        </linearGradient>
      </defs>

      {/* плитка */}
      <rect x="3" y="3" width="194" height="194" rx="46" fill="url(#lifeos-mascot-bg)" />

      {/* антенна */}
      <path d="M100 64 V44" stroke="#94A3B8" strokeWidth="5" strokeLinecap="round" />
      <circle cx="100" cy="36" r="9" fill={state === 'sleep' ? '#64748b' : '#22d3ee'} />

      {/* голова */}
      <rect x="60" y="62" width="80" height="70" rx="24" fill="#F1F5F9" />
      <rect x="72" y="76" width="56" height="40" rx="14" fill="#0B0E14" />

      {/* глаза */}
      {round ? (
        <>
          <circle cx="89" cy="94" r="6.5" fill={eye} />
          <circle cx="111" cy="94" r="6.5" fill={eye} />
        </>
      ) : (
        <path d="M82 96 q7 -8 14 0 M104 96 q7 -8 14 0" stroke={eye} strokeWidth="5" fill="none" strokeLinecap="round" />
      )}

      {/* рот: дуга вверх (радость) / прямая (сон) */}
      {state === 'sleep' ? (
        <path d="M94 106 h12" stroke={eye} strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M92 105 q8 7 16 0" stroke={eye} strokeWidth="3" fill="none" strokeLinecap="round" />
      )}

      {/* щёчки */}
      <ellipse cx="76" cy="110" rx="4" ry="2.6" fill="#FDA4AF" opacity="0.5" />
      <ellipse cx="124" cy="110" rx="4" ry="2.6" fill="#FDA4AF" opacity="0.5" />

      {/* корпус и руки */}
      <rect x="76" y="138" width="48" height="36" rx="15" fill="#E2E8F0" />
      <rect x="56" y="142" width="18" height="11" rx="5.5" fill="#CBD5E1" />
      <rect x="126" y="142" width="18" height="11" rx="5.5" fill="#CBD5E1" />

      {/* «>_» на груди */}
      <path d="M94 152 l5 5 -5 5" stroke={state === 'error' ? '#f87171' : '#22d3ee'} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M103 162 h7" stroke={state === 'error' ? '#f87171' : '#22d3ee'} strokeWidth="3" strokeLinecap="round" />

      {/* ноги */}
      <rect x="80" y="174" width="16" height="8" rx="4" fill="#CBD5E1" />
      <rect x="104" y="174" width="16" height="8" rx="4" fill="#CBD5E1" />
    </svg>
  )
}

export default Mascot
