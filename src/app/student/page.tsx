import { EmptyState } from '@/components/ui';

export default function StudentHomePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">My tests</h1>
      <p className="mt-1 text-sm text-slate-500">Tests your teacher publishes will appear here.</p>

      <div className="mt-6">
        <EmptyState
          title="The test runner isn't built yet"
          hint="This local build currently covers paper digitization and the question bank (stages 0–5 of the build plan). The test builder and test runner land in later stages."
        />
      </div>
    </div>
  );
}
