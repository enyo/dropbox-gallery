import { dev } from "$app/env";
import { redirect } from "@sveltejs/kit";

export const load = async () => {
  if (!dev) {
    throw redirect(302, "https://www.hannahmayr.com");
  }
};
