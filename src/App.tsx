import { Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { Join } from "./routes/Join";
import { GroupLayout } from "./routes/GroupLayout";
import { Matches } from "./routes/Matches";
import { Leaderboard } from "./routes/Leaderboard";
import { Members } from "./routes/Members";
import { Bracket } from "./routes/Bracket";
import { BracketBuilder } from "./routes/BracketBuilder";
import { Admin } from "./routes/Admin";
import { Me } from "./routes/Me";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join" element={<Join />} />
      <Route path="/me" element={<Me />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/g/:code" element={<GroupLayout />}>
        <Route index element={<Matches />} />
        <Route path="bracket" element={<Bracket />} />
        <Route path="bracket/build" element={<BracketBuilder />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="members" element={<Members />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
