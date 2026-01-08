// src/auth/google.js
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export function setupGoogleAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (!clientID || !clientSecret || !callbackURL) {
    throw new Error("Faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL en .env");
  }

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile?.emails?.[0]?.value?.toLowerCase() || null;
          const googleId = profile?.id || null;
          const nombre = profile?.name?.givenName || "";
          const apellido = profile?.name?.familyName || "";
          const avatarUrl = profile?.photos?.[0]?.value || "";

          if (!email || !googleId) return done(null, false);

          return done(null, { email, googleId, nombre, apellido, avatarUrl });
        } catch (e) {
          return done(e);
        }
      }
    )
  );
}

export default passport;
