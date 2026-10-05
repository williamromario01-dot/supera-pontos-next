import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import clientPromise from "@/lib/mongodb";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_IMAGES_PER_SCHOOL = 50;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db("supera_pontos");

  const session = await db.collection("sessions").findOne({
    token,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user || user.active === false) {
    return null;
  }

  return user;
}

export async function POST(request: NextRequest) {
  try {
    /*
     * =========================================================
     * 1. AUTENTICAÇÃO
     * =========================================================
     */

    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: "Não autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =========================================================
     * 2. PERMISSÕES
     * =========================================================
     *
     * Somente usuários administrativos podem enviar imagens.
     */

    if (
      user.role !== "super_admin" &&
      user.role !== "admin" &&
      user.role !== "educator"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para enviar imagens.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * =========================================================
     * 3. IDENTIFICAR A ESCOLA
     * =========================================================
     */

    let schoolId = "";

    if (user.role === "super_admin") {
      /*
       * Para o super_admin, a escola deverá ser enviada
       * pelo formulário através do campo schoolId.
       */
    } else {
      schoolId = String(user.schoolId || "");

      if (!schoolId) {
        return NextResponse.json(
          {
            error:
              "Não foi possível identificar a escola do usuário.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * =========================================================
     * 4. RECEBER O FORM DATA
     * =========================================================
     */

    const formData = await request.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Nenhuma imagem foi enviada.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * O super_admin pode informar a escola pelo formulário.
     */

    if (user.role === "super_admin") {
      const formSchoolId = formData.get("schoolId");

      if (!formSchoolId) {
        return NextResponse.json(
          {
            error:
              "É necessário informar a escola para enviar a imagem.",
          },
          {
            status: 400,
          }
        );
      }

      schoolId = String(formSchoolId);
    }

    /*
     * =========================================================
     * 5. VALIDAR TIPO DA IMAGEM
     * =========================================================
     */

    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Formato inválido. Envie apenas JPG, JPEG, PNG ou WebP.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =========================================================
     * 6. VALIDAR TAMANHO
     * =========================================================
     */

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error:
            "A imagem deve ter no máximo 1 MB.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =========================================================
     * 7. VERIFICAR LIMITE DE 50 IMAGENS POR ESCOLA
     * =========================================================
     *
     * O limite é compartilhado entre:
     *
     * - Loja de Pontos
     * - Produtos Supera
     *
     * Cada escola pode possuir no máximo 50 imagens.
     */

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const imageCount = await db
      .collection("uploadedImages")
      .countDocuments({
        schoolId,
        deleted: {
          $ne: true,
        },
      });

    if (imageCount >= MAX_IMAGES_PER_SCHOOL) {
      return NextResponse.json(
        {
          error:
            "Esta escola já atingiu o limite de 50 imagens. Exclua uma imagem existente para enviar outra.",
          limit: MAX_IMAGES_PER_SCHOOL,
          current: imageCount,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =========================================================
     * 8. GERAR NOME ÚNICO
     * =========================================================
     */

    const extensionMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const extension =
      extensionMap[file.type.toLowerCase()] || "jpg";

    const uniqueName =
      `schools/${schoolId}/images/` +
      `${Date.now()}-${crypto.randomUUID()}.${extension}`;

    /*
     * =========================================================
     * 9. ENVIAR PARA O VERCEL BLOB
     * =========================================================
     */

    const blob = await put(uniqueName, file, {
      access: "public",
      addRandomSuffix: false,
    });

    /*
     * =========================================================
     * 10. REGISTRAR A IMAGEM NO MONGODB
     * =========================================================
     */

    const now = new Date();

    const imageDocument = {
      schoolId,
      url: blob.url,
      pathname: blob.pathname,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      deleted: false,
      createdAt: now,
      createdBy: user._id,
    };

    const result = await db
      .collection("uploadedImages")
      .insertOne(imageDocument);

    /*
     * =========================================================
     * 11. RETORNAR RESULTADO
     * =========================================================
     */

    return NextResponse.json(
      {
        message: "Imagem enviada com sucesso.",
        image: {
          id: result.insertedId.toString(),
          schoolId,
          url: blob.url,
          pathname: blob.pathname,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          createdAt: now,
        },
        usage: {
          current: imageCount + 1,
          limit: MAX_IMAGES_PER_SCHOOL,
          remaining:
            MAX_IMAGES_PER_SCHOOL - (imageCount + 1),
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao realizar upload da imagem:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao enviar a imagem.",
      },
      {
        status: 500,
      }
    );
  }
}