export const requireIdentity: RequestHandler = async (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");

  console.log("requireIdentity token:", Boolean(token));

  if (!token || !config.SUPABASE_URL) {
    console.log("requireIdentity missing token or SUPABASE_URL:", {
      tokenPresent: !!token,
      supabaseUrl: !!config.SUPABASE_URL,
    });

    return res.status(401).json({ error: "Unauthenticated" });
  }

  const supabase = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.getUser(token);

  console.log("requireIdentity supabase.getUser:", {
    error: error?.message ?? null,
    userId: data.user?.id ?? null,
    email: data.user?.email ?? null,
  });

  if (error || !data.user?.email) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const user = await ensureUser({
    id: data.user.id,
    email: data.user.email,
  });

  console.log("requireIdentity ensureUser:", {
    prismaUserId: user.id,
    prismaEmail: user.email,
  });

  res.locals.identity = {
    id: user.id,
    email: user.email,
  };

  console.log("requireIdentity success");

  next();
};