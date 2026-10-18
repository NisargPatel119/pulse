// A heartbeat line on a dark square
export function Mark({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, background: '#0e1013', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h4l2.5-7 4 14 3-9 1.5 2H22" />
      </svg>
    </div>
  );
}
