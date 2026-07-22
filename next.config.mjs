/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongoose', 'bcryptjs', 'nodemailer'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
