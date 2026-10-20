import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeamFlow — Make good work together",
  description: "A calmer place for teams to plan work, share progress and move projects forward.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
