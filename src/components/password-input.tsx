"use client";

import { ComponentProps, useState } from "react";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

export default function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <button type="button" className="password-toggle" aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"} onClick={() => setVisible((current) => !current)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
