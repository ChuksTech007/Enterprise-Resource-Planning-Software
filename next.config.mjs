/* One id for this build, shared by Next and the service worker.
 *
 * The worker caches the app HTML so a screen still opens on a bad
 * connection. That HTML names the exact script files of the build it came
 * from, and the next build deletes those files — so a cached page asks for
 * scripts that are gone and the app dies on a blank screen reading "a
 * client-side exception has occurred". Reloading does not help, because
 * the reload is served from the same cache.
 *
 * Tying the cache name to the build is what makes an update safe: a new
 * build is a new id, which is a new worker, which throws the old cache out
 * on its way in. */
const buildId = `b${Date.now().toString(36)}`;
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongoose', 'bcryptjs', 'nodemailer'],
  eslint: { ignoreDuringBuilds: true },
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
};

export default nextConfig;
