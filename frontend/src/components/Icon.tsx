// The only icons in the app: call, mute and end call. Thin 1.5px strokes on a 24px grid, drawn here.
const HANDSET = 'M7 3h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 5 5a2 2 0 0 1 2-2z'

const PATHS = {
  call: <path d={HANDSET} />,
  end: <path d={HANDSET} transform="rotate(135 12 12)" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  muted: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" />
    </>
  ),
}

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
