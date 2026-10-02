import type { CSSProperties, ReactNode } from "react";
import { C, FONT } from "../theme";
import { BellIcon, WifiIcon } from "./Icons";

export const PHONE_W = 600;
export const PHONE_H = 1220;
const BEZEL = 12;

/** A dark Android-style handset. Children are laid out in the 576×1196 screen. */
export const Phone = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      position: "relative",
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: 86,
      background: "#0a0f0e",
      padding: BEZEL,
      boxShadow: "0 50px 140px rgba(0,0,0,0.65), inset 0 0 0 2px #2a3532, 0 0 0 1px rgba(95,227,184,0.12)",
      ...style,
    }}
  >
    <div
      style={{
        position: "relative",
        width: PHONE_W - BEZEL * 2,
        height: PHONE_H - BEZEL * 2,
        borderRadius: 74,
        background: C.bg,
        overflow: "hidden",
        fontFamily: FONT.ui,
        color: C.ink,
      }}
    >
      <StatusBar />
      {children}
      <div
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          width: 26,
          height: 26,
          marginLeft: -13,
          borderRadius: 13,
          background: "#000",
          boxShadow: "inset 0 0 0 3px #161d1b",
        }}
      />
    </div>
    <div style={{ position: "absolute", right: -5, top: 250, width: 5, height: 120, borderRadius: 3, background: "#26302d" }} />
    <div style={{ position: "absolute", right: -5, top: 420, width: 5, height: 70, borderRadius: 3, background: "#26302d" }} />
  </div>
);

const StatusBar = () => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 74,
      padding: "20px 40px 0",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 24,
      fontWeight: 600,
      color: C.ink,
      zIndex: 5,
    }}
  >
    <span>9:41</span>
    <span style={{ display: "flex", gap: 12, alignItems: "center", opacity: 0.9 }}>
      <WifiIcon size={26} />
      <BellIcon size={24} />
      <span
        style={{
          width: 42,
          height: 20,
          borderRadius: 6,
          border: `2.5px solid ${C.ink}`,
          padding: 2,
          boxSizing: "border-box",
        }}
      >
        <span style={{ display: "block", width: "78%", height: "100%", borderRadius: 2, background: C.brand }} />
      </span>
    </span>
  </div>
);
