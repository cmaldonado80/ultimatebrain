export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-deep font-sans">
      <div className="text-center p-10">
        <div className="text-7xl font-extrabold text-slate-700 leading-none mb-2">404</div>
        <h1 className="text-[22px] font-bold text-slate-50 m-0 mb-2">Page not found</h1>
        <p className="text-sm text-slate-500 m-0 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a href="/" className="text-sm text-neon-purple no-underline font-semibold hover:underline">
          Back to Dashboard
        </a>
      </div>
    </div>
  )
}
