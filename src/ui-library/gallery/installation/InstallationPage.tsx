/**
 * InstallationPage — Gallery infrastructure (Foundations)
 *
 * Step-by-step guide for installing @diwauhris/ui.
 * The package is self-contained — fonts, brand tokens, component styles,
 * and Toast overrides all compile into lib/assets/ui.css at build time.
 * Consumers only need three things: npm install, one CSS import, one Toaster mount.
 */

import { Package, FileCode2, Puzzle, CheckCircle2 } from 'lucide-react';
import { GalleryLayout } from '../GalleryLayout';
import { GalleryPageWrapper } from '../components/GalleryPageWrapper';
import { GalleryComponentHeader } from '../components/GalleryComponentHeader';
import { GallerySection } from '../components/GallerySection';
import { CopyCodeBlock } from '../components/CopyCodeBlock';

// ── Code strings ──────────────────────────────────────────────────────────────

const CODE = {
  install: `npm install @diwauhris/ui`,

  cssImport: `// main.tsx (or your app entry point)
// Both paths resolve to the same file via package.json exports:
//   '@diwauhris/ui/lib/assets/ui.css'  — explicit lib path (always works)
//   '@diwauhris/ui/styles.css'          — shorthand alias (also valid)
import '@diwauhris/ui/lib/assets/ui.css';`,

  toasterSetup: `// App.tsx — mount once at the app root
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      {/* ...your router / providers... */}
      <Toaster
        position="top-right"
        theme="light"
        richColors
        toastOptions={{ duration: 4000 }}
      />
    </>
  );
}`,

  usage: `import { Alert, Button } from '@diwauhris/ui';
import { toast } from 'sonner';

// Inline alert
<Alert tone="success" title="Saved">
  Employee record has been updated.
</Alert>

// Toast notification (call from anywhere)
toast.success('Employee record saved successfully.');`,
};

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({
  step,
  icon: Icon,
  title,
  children,
  last = false,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white text-sm font-bold shadow-sm">
          {step}
        </div>
        {!last && <div className="mt-2 flex-1 w-px bg-slate-200" aria-hidden="true" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? 'pb-0' : 'pb-8'}`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon size={16} className="text-brand-blue shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InstallationPage() {
  return (
    <GalleryLayout activeId="installation">
      <title>Installation — UI Component Gallery</title>
      <GalleryPageWrapper>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <GalleryComponentHeader
          category="Foundations"
          name="Installation"
          description="One install. Everything included. Fonts, brand tokens, component styles, and Toast overrides all ship pre-compiled inside the package — no Tailwind config, no font setup required."
          status="complete"
        />

        {/* ── Requirements ─────────────────────────────────────────────── */}
        <GallerySection
          id="requirements"
          title="Requirements"
          description="Make sure your project meets these before installing."
        >
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {[
              ['React',      '≥ 18', 'Peer dependency — must already be in your project.'],
              ['Node.js',    '≥ 18', 'Required for the npm install and build toolchain.'],
              ['TypeScript', '≥ 5',  'Optional but recommended. Full type declarations are included.'],
            ].map(([dep, version, note]) => (
              <div key={String(dep)} className="flex items-start gap-4 px-5 py-4">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-800">{dep}</span>
                    <span className="font-mono text-xs text-brand-blue font-semibold">{version}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </GallerySection>

        {/* ── Steps ────────────────────────────────────────────────────── */}
        <GallerySection
          id="steps"
          title="Setup"
          description="Install the package, add one import line, mount the Toaster. That's it."
        >
          <div className="pt-2">

            {/* Step 1 */}
            <StepCard step={1} icon={Package} title="Install the package">
              <p className="mb-3 text-sm font-medium text-slate-600">
                Install <code className="text-xs">@diwauhris/ui</code>. Sonner and lucide-react are
                bundled as dependencies — they install automatically. No font packages, no Tailwind
                config, no extra setup.
              </p>
              <CopyCodeBlock code={CODE.install} language="bash" title="Terminal" />
            </StepCard>

            {/* Step 2 */}
            <StepCard step={2} icon={FileCode2} title="Import the stylesheet">
              <p className="mb-3 text-sm font-medium text-slate-600">
                Add one import at your app entry point. This is required because bundlers don't
                auto-apply package stylesheets — but it's a single line, and it brings in
                everything: brand fonts, resets, all component styles, Toast overrides, and the
                Date Picker theme. Pre-compiled. Nothing else to configure.
              </p>
              <CopyCodeBlock code={CODE.cssImport} language="tsx" title="main.tsx" />
            </StepCard>

            {/* Step 3 */}
            <StepCard step={3} icon={Puzzle} title="Mount the Toaster" last>
              <p className="mb-3 text-sm font-medium text-slate-600">
                Add the Sonner <code className="text-xs">&lt;Toaster&gt;</code> once at your app
                root. This registers the toast portal that all{' '}
                <code className="text-xs">toast()</code> calls render into.
              </p>
              <CopyCodeBlock code={CODE.toasterSetup} language="tsx" title="App.tsx" />
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800">
                  Mount <code>&lt;Toaster&gt;</code> only once — at the app root. Adding it inside
                  a feature component or page causes duplicate notifications.
                </p>
              </div>
            </StepCard>

          </div>
        </GallerySection>

        {/* ── Usage ────────────────────────────────────────────────────── */}
        <GallerySection
          id="usage"
          title="Usage"
          description="Import components directly from the package. Tree-shaking is fully supported."
        >
          <CopyCodeBlock code={CODE.usage} language="tsx" title="Example" />
        </GallerySection>

        {/* ── What's included ───────────────────────────────────────────── */}
        <GallerySection
          id="whats-included"
          title="What's included in ui.css"
          description="Everything that ships pre-compiled in lib/assets/ui.css — nothing the consumer needs to configure."
        >
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {[
              ['Brand fonts',         'Barlow (700, 800) and Libre Franklin variable — self-hosted via @fontsource, embedded as @font-face rules.'],
              ['CSS reset',           'Preflight-equivalent resets: box-sizing, margin/padding zero, button/link chrome removal, font inheritance.'],
              ['Tailwind utilities',  'All utility classes used across every component, compiled to static CSS — no Tailwind setup needed in the consumer project.'],
              ['Brand tokens',        'Body font stack, background (#f4f6f9), and text (#0c1a2e) applied to the base body element.'],
              ['Animation classes',   'os-fade, os-pop, os-slide-up, os-slide-in-right, os-bounce-in — with prefers-reduced-motion support.'],
              ['Skeleton shimmer',    'skeleton-bar pulse animation used by the Skeleton component.'],
              ['Field shake',         'shake animation used by Field on validation error.'],
              ['Toast overrides',     'Sonner richColors palette aligned to Alert — emerald/sky/amber/rose tones with left-border rule.'],
              ['Date Picker theme',   'Full .pis-rc-calendar override skin for react-calendar with DIWA brand colors.'],
            ].map(([label, desc]) => (
              <div key={String(label)} className="flex items-start gap-4 px-5 py-4">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand-blue" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold text-slate-800">{label}</span>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </GallerySection>

        {/* ── Package info ──────────────────────────────────────────────── */}
        <GallerySection id="package-info" title="Package Details">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">Detail</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Package name',      '@diwauhris/ui'],
                    ['Current version',   __APP_VERSION__],
                    ['Module formats',    'ESM (.mjs) + CJS (.cjs)'],
                    ['Type declarations', 'Included — lib/types/ui-library/index.d.ts'],
                    ['Stylesheet',        'lib/assets/ui.css (pre-compiled, self-contained)'],
                    ['Peer dependencies', 'react ≥ 18, react-dom ≥ 18'],
                    ['Bundled deps',      'sonner, lucide-react, tailwind-merge, clsx'],
                  ].map(([label, value]) => (
                    <tr key={String(label)} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3.5 text-xs font-semibold text-slate-700 align-top">{label}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-brand-blue align-top">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </GallerySection>

      </GalleryPageWrapper>
    </GalleryLayout>
  );
}
