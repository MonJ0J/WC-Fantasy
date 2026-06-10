import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * /join?code=WC-XXXXXX is a deep-link entry point shared via invite links.
 * Redirects to the Landing page with the code prefilled (via location state).
 */
export function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get("code")?.toUpperCase() ?? "";
    navigate("/", { replace: true, state: { joinCode: code } });
  }, [params, navigate]);

  return null;
}
