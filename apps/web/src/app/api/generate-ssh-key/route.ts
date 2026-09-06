import { NextResponse } from "next/server";

/**
 * Cette ancienne route ne génère volontairement plus de clés privées côté
 * serveur. La génération est faite avec Web Crypto dans le navigateur afin
 * d'éviter un endpoint public coûteux et de garder la clé sur le poste client.
 */
export function POST() {
  return NextResponse.json(
    { error: "La génération de clés SSH est désormais locale au navigateur." },
    { status: 410 },
  );
}
