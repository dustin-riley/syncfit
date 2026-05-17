export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="ds-panel w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="ds-display">SyncFit</h1>
          <p className="ds-caption text-muted-foreground">
            Train smart. Progress on purpose.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
