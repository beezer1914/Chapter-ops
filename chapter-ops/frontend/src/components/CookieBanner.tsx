import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const CONSENT_KEY = "cookie-consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-[60] p-5 shadow-2xl"
      style={{
        backgroundColor: "#07101e",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        color: "rgba(255, 255, 255, 0.85)",
      }}
    >
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "rgba(255, 255, 255, 0.72)" }}>
        We use essential cookies for authentication and security. By continuing, you agree to our{" "}
        <Link
          to="/legal/cookies"
          className="text-brand-primary-light hover:underline"
        >
          Cookie Policy
        </Link>
        .
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={accept}
          className="flex-1 bg-brand-primary-main text-white text-[13px] font-semibold py-2.5 px-4 hover:bg-brand-primary-dark transition-colors"
        >
          Accept
        </button>
        <Link
          to="/legal/cookies"
          className="text-[12px] hover:underline"
          style={{ color: "rgba(255, 255, 255, 0.55)" }}
        >
          Learn more
        </Link>
      </div>
    </div>
  );
}
