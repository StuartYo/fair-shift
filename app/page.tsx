import { currentMode, modeNote } from "@/lib/config";
import FairShift from "./ui/FairShift";

export const dynamic = "force-dynamic";

export default function Home() {
  const mode = currentMode();
  return <FairShift initialMode={mode} initialNote={modeNote(mode)} />;
}
