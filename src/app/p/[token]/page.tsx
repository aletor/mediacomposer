import { notFound } from "next/navigation";
import { findShareByToken } from "@/lib/presenter-share-db";
import { toPublicPresenterShareRecord } from "@/lib/presenter-share-types";
import { PublicPresenterClient } from "./PublicPresenterClient";

export default async function PublicPresenterPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const row = await findShareByToken(token);
  if (!row) notFound();

  if (row.options.autoDisableLink && row.options.autoDisableAt) {
    const t = new Date(row.options.autoDisableAt).getTime();
    if (!Number.isNaN(t) && t < Date.now()) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 text-center text-sm text-zinc-300">
          Este enlace ya no está disponible.
        </div>
      );
    }
  }

  return <PublicPresenterClient initial={toPublicPresenterShareRecord(row)} />;
}
