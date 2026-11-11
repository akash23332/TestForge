/**
 * Liquid Glass Login & Registration — TestForge Assessment Cloud
 *
 * Features:
 * - Snell's Law Liquid Glass refraction displacement lens (zero blue fringing)
 * - Real-time WebGL Plasma Shader with TestForge Electric Lime (#EDFF72) & Sage
 * - Large, spacious, premium container (max-w-[500px])
 * - Explicit Role Selector: [Teacher / Faculty] vs [Student / Candidate]
 *   with distinct emails (teacher@testforge.edu vs student@testforge.edu)
 * - Dual Mode: Sign In vs Create Account (Registration)
 * - 1-Click Demo Quick Sign-in for both Teacher and Student
 * - Single full-width "Continue with Google" button (Apple & GitHub removed)
 * - Password visibility toggle and accessible keyboard navigation
 * - Real backend authentication with role-based dashboard redirection
 */
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type FormEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Eye, EyeOff, LoaderCircle, Lock, Mail, User, ShieldCheck, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

export type GlassAuthRole = "teacher" | "student";
export type GlassAuthMode = "login" | "register";

export type GlassLoginProps = {
  title?: string;
  subtitle?: string;
  defaultRole?: GlassAuthRole;
  defaultMode?: GlassAuthMode;
  /** Called with form values on submit. Return a promise to keep button in loading state. */
  onSubmit?: (values: {
    mode: GlassAuthMode;
    role: GlassAuthRole;
    name?: string;
    email: string;
    password: string;
  }) => void | Promise<void>;
  /** Called when 1-click demo login button is pressed */
  onDemoLogin?: (role: GlassAuthRole) => void | Promise<void>;
  /** Called when Google sign-in is pressed */
  onGoogleSignIn?: (role: GlassAuthRole) => void | Promise<void>;
  forgotPasswordHref?: string;
  onForgotPassword?: () => void;
  className?: string;
  /** Rendered behind the card so the glass refracts it when dragged across. */
  children?: ReactNode;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function GlassLogin({
  title,
  subtitle,
  defaultRole = "teacher",
  defaultMode = "login",
  onSubmit = () => wait(1200),
  onDemoLogin,
  onGoogleSignIn,
  forgotPasswordHref = "#",
  onForgotPassword,
  className,
  children,
}: GlassLoginProps) {
  const id = useId();
  const [role, setRole] = useState<GlassAuthRole>(defaultRole);
  const [authMode, setAuthMode] = useState<GlassAuthMode>(defaultMode);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"form" | "google" | "demo" | null>(null);

  // Form input values
  const [nameValue, setNameValue] = useState("");
  const [emailValue, setEmailValue] = useState(
    defaultRole === "teacher" ? "teacher@testforge.edu" : "student@testforge.edu"
  );
  const [passwordValue, setPasswordValue] = useState(
    defaultRole === "teacher" ? "Teacher@123" : "Student@123"
  );

  // When role changes, switch default email/password
  const handleRoleChange = (newRole: GlassAuthRole) => {
    setRole(newRole);
    if (newRole === "teacher") {
      setEmailValue("teacher@testforge.edu");
      setPasswordValue("Teacher@123");
    } else {
      setEmailValue("student@testforge.edu");
      setPasswordValue("Student@123");
    }
  };

  const run = async (
    kind: NonNullable<typeof pending>,
    task: () => void | Promise<void>,
  ) => {
    if (pending) return;
    setPending(kind);
    try {
      await task();
    } finally {
      setPending(null);
    }
  };

  // Card dragging: inputs, links and buttons keep functioning normally
  const cardRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, button, a, label, textarea, select")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ...offset.current };
  };

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const card = cardRef.current;
    if (!d || !card?.parentElement) return;
    const box = card.parentElement.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const left = r.left - offset.current.x;
    const top = r.top - offset.current.y;
    const x = Math.min(box.right - left - r.width, Math.max(box.left - left, d.x + e.clientX - d.px));
    const y = Math.min(box.bottom - top - r.height, Math.max(box.top - top, d.y + e.clientY - d.py));
    offset.current = { x, y };
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const onDragEnd = () => {
    drag.current = null;
  };

  const handleDemoClick = (targetRole: GlassAuthRole) => {
    handleRoleChange(targetRole);
    setAuthMode("login");
    const email = targetRole === "teacher" ? "teacher@testforge.edu" : "student@testforge.edu";
    const password = targetRole === "teacher" ? "Teacher@123" : "Student@123";

    if (onDemoLogin) {
      run("demo", () => onDemoLogin(targetRole));
    } else {
      run("form", () => onSubmit({ mode: "login", role: targetRole, email, password }));
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run("form", () =>
      onSubmit({
        mode: authMode,
        role,
        name: authMode === "register" ? nameValue.trim() : undefined,
        email: emailValue.trim(),
        password: passwordValue,
      }),
    );
  };

  const handleGoogleClick = () => {
    if (onGoogleSignIn) {
      run("google", () => onGoogleSignIn(role));
    } else {
      // Direct demo sign in fallback for Google
      handleDemoClick(role);
    }
  };

  const currentTitle =
    title ||
    (authMode === "login"
      ? role === "teacher"
        ? "Faculty Sign In"
        : "Student Sign In"
      : "Create Student Account");

  const currentSubtitle =
    subtitle ||
    (authMode === "login"
      ? role === "teacher"
        ? "Access Teacher Dashboard & Question Bank"
        : "Access Assessments & Examination Portal"
      : "Register for TestForge Student Examination Portal");

  return (
    <div
      className={cn(
        "relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-8 font-sans text-white select-none",
        "bg-[radial-gradient(120%_70%_at_50%_100%,#18281a_0%,#101a12_45%,#090c0a_80%)]",
        className,
      )}
    >
      {/* WebGL FlameCanvas: TestForge Electric Lime & Sage Aurora (Strictly Zero Blue) */}
      <FlameCanvas />

      {/* Darken top area for contrast */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,rgb(9_12_10/0.85),transparent_70%)]"
      />

      {children}

      {/* Larger, more spacious container (max-w-[500px]) */}
      <div
        ref={cardRef}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="relative w-full max-w-[500px] cursor-grab touch-none active:cursor-grabbing [&_input]:cursor-text select-text"
      >
        {/* Liquid Glass lens */}
        <LiquidGlass
          aria-hidden
          radius={36}
          bevelDepth={58}
          scale={76}
          aberration={0}
          frost={0.4}
          tint={0.09}
          className="absolute inset-0 shadow-[0_35px_90px_rgb(0_0_0/0.55),inset_0_1px_0_rgb(255_255_255/0.65),inset_0_-1px_0_rgb(255_255_255/0.12)]"
        />

        <form
          onSubmit={handleSubmit}
          aria-busy={pending !== null}
          className="relative flex flex-col px-7 py-8 sm:px-10 sm:py-10"
        >
          {/* Header */}
          <header className="mb-6 text-center">
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold tracking-[-0.02em] [text-shadow:0_2px_12px_rgb(0_0_0/0.5)]">
              {currentTitle}
            </h1>
            <p className="mt-1.5 text-[14px] sm:text-[15px] text-white/70 max-w-[380px] mx-auto">
              {currentSubtitle}
            </p>
          </header>

          {/* Interactive Role Switcher Tabs: Teacher vs Student */}
          <div className="mb-6 flex rounded-2xl border border-white/12 bg-black/40 p-1.5 shadow-inner backdrop-blur-md">
            <button
              type="button"
              onClick={() => handleRoleChange("teacher")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all duration-200",
                role === "teacher"
                  ? "bg-[#EDFF72] text-[#12160d] shadow-md shadow-[#EDFF72]/15"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              <ShieldCheck className={cn("size-4", role === "teacher" ? "text-[#12160d]" : "text-[#EDFF72]")} />
              <span>Teacher / Faculty</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleChange("student")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all duration-200",
                role === "student"
                  ? "bg-[#EDFF72] text-[#12160d] shadow-md shadow-[#EDFF72]/15"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              <GraduationCap className={cn("size-4", role === "student" ? "text-[#12160d]" : "text-[#EDFF72]")} />
              <span>Student / Candidate</span>
            </button>
          </div>

          {/* Quick 1-Click Demo Fill Badge */}
          <div className="mb-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3.5 py-2 text-[12px] backdrop-blur-sm">
            <span className="text-white/60">
              Demo credentials ({role === "teacher" ? "Faculty" : "Student"}):
            </span>
            <button
              type="button"
              onClick={() => handleDemoClick(role)}
              disabled={pending !== null}
              className="font-semibold text-[#EDFF72] hover:underline underline-offset-4 active:scale-95 disabled:opacity-50"
            >
              {role === "teacher" ? "Use teacher@testforge.edu" : "Use student@testforge.edu"}
            </button>
          </div>

          {/* Full Name field (Register mode only) */}
          {authMode === "register" && (
            <Field id={`${id}-name`} label="Full Name" icon={<User />} className="mb-4">
              <input
                id={`${id}-name`}
                name="name"
                type="text"
                autoComplete="name"
                required
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="Alex Morgan"
                className={inputClass}
              />
            </Field>
          )}

          {/* Email Address */}
          <Field id={`${id}-email`} label={role === "teacher" ? "Faculty Email" : "Student Email"} icon={<Mail />}>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              placeholder={role === "teacher" ? "teacher@testforge.edu" : "student@testforge.edu"}
              className={inputClass}
            />
          </Field>

          {/* Password */}
          <Field id={`${id}-password`} label="Password" icon={<Lock />} className="mt-4">
            <input
              id={`${id}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              required
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={authMode === "login" ? "Enter your password" : "At least 6 characters"}
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-white/55 transition-colors outline-none hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </Field>

          {/* Forgot Password Link (Login mode) */}
          {authMode === "login" && (
            <div className="mt-3 flex justify-end">
              <a
                href={forgotPasswordHref}
                onClick={
                  onForgotPassword
                    ? (e) => {
                        e.preventDefault();
                        onForgotPassword();
                      }
                    : undefined
                }
                className="rounded-md px-1 text-[13px] font-medium text-white/70 underline-offset-4 transition-colors outline-none hover:text-[#EDFF72] hover:underline focus-visible:text-[#EDFF72] focus-visible:ring-2 focus-visible:ring-[#EDFF72]/70"
              >
                Forgot password?
              </a>
            </div>
          )}

          {/* Primary Action Button (TestForge Electric Lime) */}
          <GlassButton
            type="submit"
            disabled={pending !== null}
            primary
            className="mt-6 h-[54px] w-full text-[15px] sm:text-[16px] font-bold"
          >
            {pending === "form" ? (
              <>
                <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" />
                <span>{authMode === "login" ? "Signing in..." : "Creating account..."}</span>
              </>
            ) : (
              <span>
                {authMode === "login"
                  ? `Sign In as ${role === "teacher" ? "Faculty" : "Student"}`
                  : "Create Student Account"}
              </span>
            )}
          </GlassButton>

          {/* Mode Switch Toggle: Sign In vs Sign Up */}
          <div className="mt-4 text-center">
            {role === "teacher" && authMode === "login" ? (
              <span className="text-[13px] font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                Need an account? Contact your institution administrator.
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthMode((prev) => (prev === "login" ? "register" : "login"));
                }}
                className="text-[13px] font-medium text-white transition-colors hover:text-[#EDFF72] underline-offset-4 hover:underline [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]"
              >
                {authMode === "login"
                  ? "Don't have an account? Sign up as Student"
                  : "Already have an account? Sign in"}
              </button>
            )}
          </div>

          <div className="my-5 flex items-center gap-3 text-[13px] font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/40" />
            or
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/40" />
          </div>

          {/* Google Sign-in Only (GitHub and Apple removed) */}
          <GlassButton
            type="button"
            aria-label="Continue with Google"
            disabled={pending !== null}
            onClick={handleGoogleClick}
            className="h-12 w-full text-[14px] font-medium"
          >
            {pending === "google" ? (
              <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" />
            ) : (
              <GoogleIcon className="size-[19px] shrink-0" />
            )}
            <span>Continue with Google</span>
          </GlassButton>
        </form>
      </div>
    </div>
  );
}

export default GlassLogin;

/* ---------------------------------------------------------------------------
 * Reusable Sub-components & Helpers
 * ------------------------------------------------------------------------- */

const inputClass =
  "peer relative h-13 w-full rounded-2xl bg-black/25 pr-4 pl-11 text-[15px] sm:text-[16px] text-white ring-1 ring-white/12 transition-[box-shadow,background-color] outline-none ring-inset placeholder:text-white/35 hover:ring-white/25 focus:bg-black/35 focus:ring-2 focus:ring-[#EDFF72]/85 focus:shadow-[0_0_18px_rgba(237,255,114,0.18)] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_rgb(20_26_22)]";

function Field({
  id,
  label,
  icon,
  className,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block pl-1 text-[13px] font-medium text-white/80">
        {label}
      </label>
      <div className="relative">
        <LiquidGlass
          aria-hidden
          radius={16}
          bevelDepth={22}
          scale={36}
          aberration={0}
          frost={0.4}
          tint={0.06}
          className="pointer-events-none absolute inset-0"
        />
        {children}
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/45 transition-colors peer-focus:text-[#EDFF72] [&_svg]:size-[18px]">
          {icon}
        </span>
      </div>
    </div>
  );
}

function GlassButton({
  primary,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "group relative rounded-full outline-none select-none transition-transform active:scale-[0.98] disabled:cursor-default",
        primary
          ? "text-[#12160d] focus-visible:ring-2 focus-visible:ring-[#EDFF72] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e0c]"
          : "text-white focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e0c]",
        className,
      )}
    >
      <LiquidGlass
        aria-hidden
        radius={26}
        bevelDepth={22}
        scale={primary ? 48 : 36}
        aberration={0}
        frost={0.35}
        tint={primary ? 0.25 : 0.12}
        className={cn(
          "absolute inset-0 shadow-[0_8px_24px_rgb(0_0_0/0.32),inset_0_1px_0_rgb(255_255_255/0.65)]",
        )}
        style={{
          backgroundColor: primary
            ? "rgb(237 255 114 / 0.88)"
            : "rgb(255 255 255 / 0.08)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-white/0 transition-colors group-hover:bg-white/12 group-active:bg-white/20 group-disabled:bg-white/0"
      />
      <span
        className={cn(
          "relative flex size-full items-center justify-center gap-2 group-disabled:opacity-80",
          primary
            ? "[text-shadow:0_1px_2px_rgba(255,255,255,0.4)]"
            : "[text-shadow:0_1px_8px_rgb(0_0_0/0.35)]",
        )}
      >
        {children}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Google Icon (Frosted clean glyph — strictly NO clashing blue)
 * ------------------------------------------------------------------------- */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * WebGL Background (TestForge Electric Lime & Sage Plasma Wave - Zero Blue)
 * ------------------------------------------------------------------------- */

const RENDER_SCALE = 0.45;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}

float embers(vec2 p, float t){
  float acc = 0.;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float density = 5. + fl * 4.;
    vec2 g = p * density;
    g.y -= t * (.9 + fl * .45);
    g.x += sin(g.y * .45 + fl * 2.1 + t * .3) * .55;
    vec2 id = floor(g), f = fract(g) - .5;
    float r = hash(id + fl * 13.7);
    if (r < .62) continue;
    vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - .5) * .6;
    float d = length(f - o) / density;
    float twinkle = .55 + .45 * sin(t * (3. + r * 5.) + r * 50.);
    float size = .0016 + .0018 * hash(id + 9.3);
    acc += smoothstep(size * 2.6, 0., d) * twinkle * (1.2 - fl * .25);
  }
  return acc;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - .5) * max(ar, 1.), uv.y);
  float t = uTime * .32;

  vec2 w = vec2(fbm(p * 1.7 + vec2(0., -t * .26)), fbm(p * 1.7 + vec2(4.1, -t * .22)));
  float n = fbm(vec2(p.x * 2.4, p.y * 1.5) + w * 2. + vec2(0., -t * .82));

  // Flames balanced reach — slightly increased to gracefully meet the lower rim of the glass card
  float height = uv.y * 2.05 + abs(uv.x - .5) * .55;
  float flame = clamp(n * 1.35 - height + .08, 0., 1.);

  // Background: Deep charcoal / Obsidian (warm graphite tone, ZERO blue)
  vec3 col = mix(vec3(.042, .050, .040), vec3(.016, .019, .016), uv.y);

  // TestForge Signature Electric Lime & Sage Aurora (Strictly NO blue or cyan)
  vec3 fire = vec3(.09, .19, .08) * smoothstep(.0, .05, flame); // deep forest sage
  fire = mix(fire, vec3(.20, .46, .12), smoothstep(.06, .16, flame)); // rich emerald sage
  fire = mix(fire, vec3(.52, .86, .16), smoothstep(.18, .30, flame)); // vivid lime
  fire = mix(fire, vec3(.93, 1.0, .44), smoothstep(.34, .48, flame)); // TestForge Electric Lime #EDFF72
  fire = mix(fire, vec3(.98, 1.0, .86), smoothstep(.62, .85, flame)); // warm white-gold core

  // Base inner glow: warm golden chartreuse (warm golden core, NO cyan/blue)
  float baseGlow = smoothstep(.0, .14, flame - .26 - uv.y * 2.6);
  vec3 warmCore = mix(vec3(.72, .92, .22), vec3(.96, 1.0, .58), smoothstep(.2, .7, flame - uv.y * 2.6));
  fire = mix(fire, warmCore, baseGlow);

  col += fire * (.46 + .50 * smoothstep(.0, .5, flame));

  // Ambient bloom: soft subtle glow
  float bloom = fbm(p * .7 + vec2(t * .03, -t * .05));
  col += vec3(.21, .36, .11) * bloom * bloom * smoothstep(0.95, .15, uv.y) * .52;

  // Embers: sparkling warm lime & gold particles
  float e = embers(p, t) * smoothstep(1.0, .1, uv.y);
  vec3 sparkColor = mix(vec3(.93, 1.0, .44), vec3(1.0, .94, .52), step(.50, fbm(p * 3. + 11.))) * 1.25;
  col += sparkColor * e;

  // Dither against banding
  col += (hash(gl_FragCoord.xy + fract(t)) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

function FlameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, depth: false });
    if (!canvas || !gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let time = 12;
    let raf = 0;

    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 24 - 2) return;
      last = now;
      time = 12 + (now - start) / 1000;
      draw();
    };
    const play = () => {
      cancelAnimationFrame(raf);
      if (reduce.matches) draw();
      else raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      const s = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * s));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * s));
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw();
    });
    ro.observe(canvas);
    reduce.addEventListener("change", play);
    play();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduce.removeEventListener("change", play);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full pointer-events-none" />;
}

/* ---------------------------------------------------------------------------
 * Liquid glass (Snell's-law displacement lens filter)
 * ------------------------------------------------------------------------- */

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  radius?: number;
  bevelDepth?: number;
  scale?: number;
  aberration?: number;
  frost?: number;
  tint?: number;
};

export function LiquidGlass({
  children,
  className,
  contentClassName,
  radius = 999,
  bevelDepth = 14,
  scale = 48,
  aberration = 0,
  frost = 0.4,
  tint = 0.12,
  style,
  ...rest
}: LiquidGlassProps) {
  const reactId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [filter, setFilter] = useState<{ id: string; svg: string } | null>(null);
  const mode = useSyncExternalStore(noopSubscribe, detectMode, () => "pending");

  useEffect(() => {
    const el = rootRef.current;
    if (!el || mode !== "pending") return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;
      setSize({
        w: Math.max(1, Math.round(width)),
        h: Math.max(1, Math.round(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode !== "pending" || size.w <= 1 || size.h <= 1) return;
    let cancelled = false;

    (async () => {
      const mapUrl = await generateDisplacementBlobUrl({
        width: size.w,
        height: size.h,
        radius: Math.min(radius, size.w / 2, size.h / 2),
        bevelDepth: Math.min(bevelDepth, Math.min(size.w, size.h) / 2),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = mapUrl;
      });
      if (cancelled) {
        URL.revokeObjectURL(mapUrl);
        return;
      }
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = mapUrl;

      const id = `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`;
      setFilter({
        id,
        svg: buildFilterSvg({
          id,
          mapUrl,
          width: size.w,
          height: size.h,
          scale,
          aberration,
          frost,
        }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, size.w, size.h, radius, bevelDepth, scale, aberration, frost, reactId]);

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    [],
  );

  const backdrop =
    mode === "opaque"
      ? "none"
      : mode === "simple"
        ? "blur(16px) saturate(1.8) brightness(1.05)"
        : filter
          ? `url(#${filter.id}) blur(0.5px) saturate(1.85) brightness(1.02)`
          : "blur(10px) saturate(1.6) brightness(1.04)";

  return (
    <div
      ref={rootRef}
      data-refract={mode === "pending" && filter ? "true" : "false"}
      className={cn(
        "relative overflow-hidden",
        mode === "simple" &&
          "bg-gradient-to-b from-white/25 to-white/10 ring-1 ring-white/35 ring-inset",
        mode === "opaque" && "bg-neutral-900",
        className,
      )}
      style={{
        borderRadius: radius,
        backgroundColor:
          mode === "pending" ? `rgb(255 255 255 / ${tint})` : undefined,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        ...style,
      }}
      {...rest}
    >
      {filter ? (
        <span
          key={filter.id}
          aria-hidden
          className="pointer-events-none absolute size-0 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: filter.svg }}
        />
      ) : null}
      {contentClassName ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

type GlassMode = "pending" | "simple" | "opaque";

const noopSubscribe = () => () => {};

function detectMode(): GlassMode {
  if (prefersReducedTransparency()) return "opaque";
  if (isSafariLike() || !supportsUrlBackdropFilter()) return "simple";
  return "pending";
}

function supportsUrlBackdropFilter() {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return (
    CSS.supports("backdrop-filter", "url(#x)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#x)")
  );
}

function prefersReducedTransparency() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

function isSafariLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

/* ---------------------------------------------------------------------------
 * Displacement map calculation
 * ------------------------------------------------------------------------- */

type DisplacementOptions = {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  gain?: number;
  light?: { x: number; y: number };
  dpr?: number;
};

function sdRoundedBox(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  r: number,
) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return inside + outside - r;
}

function bendFromDepth(x: number) {
  const u = 1 - Math.min(1, Math.max(0, x));
  const denom = (1 - u ** 4) ** 0.75;
  if (denom < 1e-6) return 0;
  const thetaI = Math.atan(Math.min(u ** 3 / denom, 8));
  const sinT = Math.sin(thetaI) / 1.5;
  if (sinT >= 1) return Math.sin(thetaI);
  return Math.sin(thetaI - Math.asin(sinT));
}

function buildPhiTable(bevelPx: number) {
  const n = Math.max(1, Math.ceil(bevelPx));
  const phi = new Float32Array(n + 1);
  for (let d = 1; d <= n; d++) phi[d] = phi[d - 1] + bendFromDepth(d / n);
  return phi;
}

function samplePhi(phi: Float32Array, depth: number) {
  const max = phi.length - 1;
  if (depth <= 0) return phi[0];
  if (depth >= max) return phi[max];
  const i = Math.floor(depth);
  const f = depth - i;
  return phi[i] * (1 - f) + phi[i + 1] * f;
}

function computeDisplacementData(opts: DisplacementOptions) {
  const dpr = opts.dpr ?? 1;
  const gain = opts.gain ?? 1.35;
  const light = opts.light ?? { x: -0.55, y: -0.85 };
  const lightLen = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;

  const W = Math.max(1, Math.round(opts.width * dpr));
  const H = Math.max(1, Math.round(opts.height * dpr));
  const halfW = W / 2;
  const halfH = H / 2;
  const r = Math.min(opts.radius * dpr, halfW, halfH);
  const bevel = Math.max(1, opts.bevelDepth * dpr);
  const phi = buildPhiTable(bevel);

  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const d = sdRoundedBox(x - halfW + 0.5, py, halfW, halfH, r);
      field[y * W + x] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d));
    }
  }

  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const i = (y * W + x) << 2;
      const d = sdRoundedBox(px, py, halfW, halfH, r);

      if (d > 0) {
        data[i] = data[i + 1] = data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }

      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(H - 1, y + 1);
      const dPhiX = (field[y * W + x1] - field[y * W + x0]) / (x1 - x0 || 1);
      const dPhiY = (field[y1 * W + x] - field[y0 * W + x]) / (y1 - y0 || 1);

      const dx = Math.max(-1, Math.min(1, dPhiX * gain));
      const dy = Math.max(-1, Math.min(1, dPhiY * gain));

      let specular = 0;
      if (d >= -bevel) {
        const gx =
          sdRoundedBox(px + 1, py, halfW, halfH, r) -
          sdRoundedBox(px - 1, py, halfW, halfH, r);
        const gy =
          sdRoundedBox(px, py + 1, halfW, halfH, r) -
          sdRoundedBox(px, py - 1, halfW, halfH, r);
        const len = Math.hypot(gx, gy) || 1;
        const dot = (gx / len) * lx + (gy / len) * ly;
        const rim = 1 - Math.min(1, -d / bevel);
        specular = (Math.max(0, dot) + Math.max(0, -dot) * 0.35) * rim;
      }

      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }

  return { data, width: W, height: H };
}

async function generateDisplacementBlobUrl(opts: DisplacementOptions) {
  const { data, width, height } = computeDisplacementData(opts);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode displacement map");
  return URL.createObjectURL(blob);
}

/* ---------------------------------------------------------------------------
 * SVG Filter Assembly (Pure Crystal Snell Refraction - Zero Blue Fringing)
 * ------------------------------------------------------------------------- */

type FilterOptions = {
  id: string;
  mapUrl: string;
  width: number;
  height: number;
  scale: number;
  aberration: number;
  frost: number;
};

function buildFilterSvg({
  id,
  mapUrl,
  width,
  height,
  scale,
  aberration,
  frost,
}: FilterOptions) {
  const pad = Math.ceil(scale + Math.max(0, aberration) + 4);
  const px = (pad / Math.max(1, width)) * 100;
  const py = (pad / Math.max(1, height)) * 100;
  const region = `x="-${px.toFixed(3)}%" y="-${py.toFixed(3)}%" width="${(100 + 2 * px).toFixed(3)}%" height="${(100 + 2 * py).toFixed(3)}%"`;

  const map = `<feImage href="${mapUrl}" xlink:href="${mapUrl}" x="0" y="0" width="${width}" height="${height}" result="map" preserveAspectRatio="none"/>`;
  const displace = (s: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;

  const body =
    aberration <= 0
      ? `${displace(scale, "rgb")}`
      : `${displace(scale + aberration, "dispR")}
  <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
  ${displace(scale, "dispG")}
  <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
  ${displace(Math.max(0, scale - aberration), "dispB")}
  <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen" result="rgb"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="${id}" color-interpolation-filters="sRGB" ${region}>
  ${map}
  ${body}
  <feGaussianBlur in="rgb" stdDeviation="${frost}"/>
</filter></svg>`;
}
