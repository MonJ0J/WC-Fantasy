import { Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";import { Join } from "./routes/Join";
import { GroupLayout } from "./routes/GroupLayout";
import { Matches } from "./routes/Matches";
import { Leaderboard } from "./routes/Leaderboard";
import { Members } from "./routes/Members";
import { Bracket } from "./routes/Bracket";
import { Outrights } from "./routes/Outrights";
import { Admin } from "./routes/Admin";
import { Me } from "./routes/Me";
import { HowToPlay } from "./routes/HowToPlay";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  return (
    <>
      <ThemeToggle />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join" element={<Join />} />
      <Route path="/how" element={<HowToPlay />} />
      <Route path="/me" element={<Me />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/g/:code" element={<GroupLayout />}>
        <Route index element={<Matches />} />
        <Route path="outrights" element={<Outrights />} />
        <Route path="bracket" element={<Bracket />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="members" element={<Members />} />
        {/* Legacy redirect from the deprecated bracket builder. */}
        <Route path="bracket/build" element={<Navigate to="../outrights" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
