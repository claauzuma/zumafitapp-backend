import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export function initGooglePassport({ servicioUsuarios }) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    throw new Error("Faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL en .env");
  }

  // Evitar re-registrar strategy en hot-reload/dev
  const hasGoogle = passport._strategy && passport._strategy("google");
  if (hasGoogle) return passport;

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile?.emails?.[0]?.value?.toLowerCase?.().trim();
          if (!email) return done(new Error("GOOGLE_SIN_EMAIL"));

          const googleId = profile?.id || "";
          const nombre = profile?.name?.givenName || "";
          const apellido = profile?.name?.familyName || "";
          const avatarUrl = profile?.photos?.[0]?.value || "";

          const result = await servicioUsuarios.loginOrRegisterWithGoogle({
            email,
            googleId,
            nombre,
            apellido,
            avatarUrl,
          });

          return done(null, result);
        } catch (e) {
          return done(e);
        }
      }
    )
  );

  return passport;
}
