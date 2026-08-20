(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const canonical = "https://fleetos-orpin-one.vercel.app";
  const manager = "https://fleetos-davidmlangstead-dots-projects.vercel.app";
  const main = "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app";
  const allowedOrigins = [canonical, manager, main];
  const isInvite = params.get("type") === "invite";
  const hasAccessToken = params.has("access_token");

  if (!hasAccessToken) return;
  if (isInvite) {
    const invitePath = "/staff-invite";
    if (location.origin !== canonical) {
      location.replace(canonical + invitePath + location.search + location.hash);
      return;
    }
    if (location.pathname !== invitePath) history.replaceState(null, "", invitePath + location.search + location.hash);
    return;
  }

  if (location.hostname.endsWith(".vercel.app") && !allowedOrigins.includes(location.origin)) {
    location.replace(canonical + location.pathname + location.search + location.hash);
  }
})();
