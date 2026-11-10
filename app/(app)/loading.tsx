// Shown inside the main area while a page is loading.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 32, width: 180, marginBottom: 24 }} />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 120 }} />
        ))}
      </div>
    </div>
  );
}
