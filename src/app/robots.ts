import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.APP_BASE_URL ?? "https://turnamax.onrender.com").replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/register",
          "/login",
          "/checkout",
          "/forgot-password",
          "/legal/",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/pay/",
          "/reset-password/",
          "/verify-email/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
