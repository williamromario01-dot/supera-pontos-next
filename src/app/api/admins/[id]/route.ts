import { NextRequest, NextResponse } from "next/server";
import { changeUserCredentials } from "@/lib/user-credentials";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getOperationalAccessForAuth, subscriptionPastDueResponse } from "@/lib/subscription-access";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db("supera_pontos");

  const session = await db.collection("sessions").findOne({
    token,
  });

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  return user;
}

function isValidObjectId(id: string) {
  return ObjectId.isValid(id);
}

/* =========================================================
   EDITAR / ATIVAR / DESATIVAR ADMINISTRADOR
   PATCH /api/admins/[id]
   ========================================================= */

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const credentialPayload = await request.clone().json().catch(() => null);
  if (credentialPayload && ("email" in Object(credentialPayload) || "password" in Object(credentialPayload))) {
    return changeUserCredentials(request, params.id, { legacyRole: "admin" });
  }

  try {
    const authenticatedUser =
      await getAuthenticatedUser(request);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (!["super_admin", "company_admin"].includes(authenticatedUser.role)) {
      return NextResponse.json(
        {
          error:
            "Este perfil não pode editar administradores.",
        },
        { status: 403 }
      );
    }

    const adminId = params.id;

    if (!isValidObjectId(adminId)) {
      return NextResponse.json(
        { error: "ID do administrador inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const access = await getOperationalAccessForAuth(db, authenticatedUser);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponse, { status: 403 });
    }

    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Procura somente um usuário que seja administrador
    const administrator = await users.findOne({
      _id: new ObjectId(adminId),
      role: "admin",
    });

    if (!administrator) {
      return NextResponse.json(
        { error: "Administrador não encontrado." },
        { status: 404 }
      );
    }
    if (authenticatedUser.role === "company_admin" && (!authenticatedUser.companyId || String(administrator.companyId) !== String(authenticatedUser.companyId))) {
      return NextResponse.json({ error: "Administrador não encontrado." }, { status: 404 });
    }

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados enviados são inválidos." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    /* =====================================================
       NOME
       ===================================================== */

    if (body.name !== undefined) {
      const name = String(body.name).trim();

      if (name.length < 2 || name.length > 100) {
        return NextResponse.json(
          {
            error:
              "O nome deve ter entre 2 e 100 caracteres.",
          },
          { status: 400 }
        );
      }

      updateData.name = name;
    }

    // Credential fields are handled by changeUserCredentials above.

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          {
            error:
              "O campo active deve ser verdadeiro ou falso.",
          },
          { status: 400 }
        );
      }

      if (body.active === false) {
        const activeAdmins = await users.countDocuments({ role: "admin", schoolId: administrator.schoolId, active: { $ne: false } });
        if (activeAdmins <= 1) return NextResponse.json({ error: "A unidade deve manter pelo menos um administrador ativo." }, { status: 409 });
      }
      updateData.active = body.active;

      // Se desativado, encerra imediatamente
      // todas as sessões desse administrador.
      if (body.active === false) {
        await sessions.deleteMany({
          userId: administrator._id,
        });
      }
    }

    // IMPORTANTE:
    // Não permitimos alterar pela API:
    // role
    // schoolId
    // points
    // _id

    await users.updateOne(
      {
        _id: administrator._id,
      },
      {
        $set: updateData,
      }
    );

    const updatedAdministrator =
      await users.findOne({
        _id: administrator._id,
      });

    if (!updatedAdministrator) {
      return NextResponse.json(
        {
          error:
            "Administrador não encontrado após a atualização.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message:
        "Administrador atualizado com sucesso.",

      administrator: {
        id: updatedAdministrator._id.toString(),
        name: updatedAdministrator.name,
        email: updatedAdministrator.email,
        role: updatedAdministrator.role,
        schoolId:
          updatedAdministrator.schoolId?.toString() ||
          null,
        points: updatedAdministrator.points || 0,
        active:
          updatedAdministrator.active !== false,
        createdAt: updatedAdministrator.createdAt,
        updatedAt: updatedAdministrator.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao editar administrador:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao editar administrador.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   EXCLUIR ADMINISTRADOR
   DELETE /api/admins/[id]
   ========================================================= */

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authenticatedUser =
      await getAuthenticatedUser(request);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (!["super_admin", "company_admin"].includes(authenticatedUser.role)) {
      return NextResponse.json(
        {
          error:
            "Este perfil não pode revogar administradores.",
        },
        { status: 403 }
      );
    }

    const adminId = params.id;

    if (!isValidObjectId(adminId)) {
      return NextResponse.json(
        { error: "ID do administrador inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const access = await getOperationalAccessForAuth(db, authenticatedUser);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponse, { status: 403 });
    }

    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Procura somente um administrador
    const administrator = await users.findOne({
      _id: new ObjectId(adminId),
      role: "admin",
    });

    if (!administrator) {
      return NextResponse.json(
        { error: "Administrador não encontrado." },
        { status: 404 }
      );
    }
    if (authenticatedUser.role === "company_admin" && (!authenticatedUser.companyId || String(administrator.companyId) !== String(authenticatedUser.companyId))) {
      return NextResponse.json({ error: "Administrador não encontrado." }, { status: 404 });
    }
    const activeAdmins = await users.countDocuments({ role: "admin", schoolId: administrator.schoolId, active: { $ne: false } });
    if (administrator.active !== false && activeAdmins <= 1) return NextResponse.json({ error: "A unidade deve manter pelo menos um administrador ativo." }, { status: 409 });

    // Encerra todas as sessões do administrador
    await sessions.deleteMany({
      userId: administrator._id,
    });

    await users.updateOne({ _id: administrator._id }, { $set: { active: false, accessRevokedAt: new Date(), accessRevokedBy: authenticatedUser._id, updatedAt: new Date() } });

    return NextResponse.json({
      message:
        "Acesso do administrador revogado com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao excluir administrador:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao excluir administrador.",
      },
      { status: 500 }
    );
  }
}
