import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Dynamically collect all local IPs so any device on the network can access dev
const localIPs = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && !iface.internal && iface.family === 'IPv4')
  .map((iface) => iface!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localIPs,
};

export default nextConfig;
