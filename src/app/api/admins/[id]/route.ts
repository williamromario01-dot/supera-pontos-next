import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authenticatedUser =
      await getAuthenticatedUser(request);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    // Somente o super administrador pode gerenciar administradores
    if (authenticatedUser.role !== "super_admin") {
      return NextResponse.json(
        {
          error:
            "Somente o super administrador pode editar administradores.",
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

    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados enviados são inválidos." },
        { status: 400 }
      );
    }

    const updateData: any = {
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

    /* =====================================================
       E-MAIL
       ===================================================== */

    if (body.email !== undefined) {
      const email = String(body.email)
        .trim()
        .toLowerCase();

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "E-mail inválido." },
          { status: 400 }
        );
      }

      const existingEmail = await users.findOne({
        email,
        _id: {
          $ne: administrator._id,
        },
      });

      if (existingEmail) {
        return NextResponse.json(
          {
            error:
              "Este e-mail já está cadastrado no sistema.",
          },
          { status: 409 }
        );
      }

      updateData.email = email;
    }

    /* =====================================================
       SENHA
       ===================================================== */

    if (body.password !== undefined) {
      const password = String(body.password);

      if (password.length < 6 || password.length > 100) {
        return NextResponse.json(
          {
            error:
              "A senha deve ter entre 6 e 100 caracteres.",
          },
          { status: 400 }
        );
      }

      updateData.passwordHash =
        await bcrypt.hash(password, 12);

      // Encerra sessões antigas
      await sessions.deleteMany({
        userId: administrator._id,
      });
    }

    /* =====================================================
       ATIVAR / DESATIVAR
       ===================================================== */

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authenticatedUser =
      await getAuthenticatedUser(request);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    // Somente o super administrador pode excluir administradores
    if (authenticatedUser.role !== "super_admin") {
      return NextResponse.json(
        {
          error:
            "Somente o super administrador pode excluir administradores.",
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

    // Encerra todas as sessões do administrador
    await sessions.deleteMany({
      userId: administrator._id,
    });

    // Exclui o administrador
    await users.deleteOne({
      _id: administrator._id,
    });

    return NextResponse.json({
      message:
        "Administrador excluído com sucesso.",
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
