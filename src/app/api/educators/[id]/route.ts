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
   EDITAR / ATIVAR / DESATIVAR EDUCADOR
   PATCH /api/educators/[id]
   ========================================================= */

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    // Somente super_admin e admin podem gerenciar educadores
    if (
      authenticatedUser.role !== "super_admin" &&
      authenticatedUser.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para editar educadores.",
        },
        { status: 403 }
      );
    }

    const educatorId = params.id;

    if (!isValidObjectId(educatorId)) {
      return NextResponse.json(
        { error: "ID do educador inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");

    // Busca somente usuários que realmente sejam educadores
    const educator = await users.findOne({
      _id: new ObjectId(educatorId),
      role: "educator",
    });

    if (!educator) {
      return NextResponse.json(
        { error: "Educador não encontrado." },
        { status: 404 }
      );
    }

    // =====================================================
    // SEGURANÇA POR ESCOLA
    // =====================================================

    // Admin só pode administrar educadores da própria escola
    if (authenticatedUser.role === "admin") {
      if (
        !authenticatedUser.schoolId ||
        !educator.schoolId ||
        authenticatedUser.schoolId.toString() !==
          educator.schoolId.toString()
      ) {
        return NextResponse.json(
          {
            error:
              "Você não pode acessar um educador de outra escola.",
          },
          { status: 403 }
        );
      }
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

    // =====================================================
    // NOME
    // =====================================================

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

    // =====================================================
    // E-MAIL
    // =====================================================

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

      // Verifica se o novo e-mail já pertence a outra conta
      const existingEmail = await users.findOne({
        email,
        _id: {
          $ne: educator._id,
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

    // =====================================================
    // SENHA
    // =====================================================

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

      updateData.passwordHash = await bcrypt.hash(
        password,
        12
      );

      // Ao alterar a senha, encerra as sessões antigas
      await db.collection("sessions").deleteMany({
        userId: educator._id,
      });
    }

    // =====================================================
    // ATIVAR / DESATIVAR
    // =====================================================

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

      // Se o educador for desativado,
      // encerra suas sessões imediatamente.
      if (body.active === false) {
        await db.collection("sessions").deleteMany({
          userId: educator._id,
        });
      }
    }

    // Não permitimos alteração de:
    // - role
    // - schoolId
    // - points
    // - _id

    await users.updateOne(
      {
        _id: educator._id,
      },
      {
        $set: updateData,
      }
    );

    const updatedEducator = await users.findOne({
      _id: educator._id,
    });

    if (!updatedEducator) {
      return NextResponse.json(
        {
          error:
            "Educador não encontrado após a atualização.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Educador atualizado com sucesso.",

      educator: {
        id: updatedEducator._id.toString(),
        name: updatedEducator.name,
        email: updatedEducator.email,
        role: updatedEducator.role,
        schoolId:
          updatedEducator.schoolId?.toString() || null,
        points: updatedEducator.points || 0,
        active:
          updatedEducator.active !== false,
        createdAt: updatedEducator.createdAt,
        updatedAt: updatedEducator.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao editar educador:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao editar educador.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   EXCLUIR EDUCADOR
   DELETE /api/educators/[id]
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

    // Somente super_admin e admin podem excluir educadores
    if (
      authenticatedUser.role !== "super_admin" &&
      authenticatedUser.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para excluir educadores.",
        },
        { status: 403 }
      );
    }

    const educatorId = params.id;

    if (!isValidObjectId(educatorId)) {
      return NextResponse.json(
        { error: "ID do educador inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // Busca somente educador
    const educator = await users.findOne({
      _id: new ObjectId(educatorId),
      role: "educator",
    });

    if (!educator) {
      return NextResponse.json(
        { error: "Educador não encontrado." },
        { status: 404 }
      );
    }

    // =====================================================
    // SEGURANÇA POR ESCOLA
    // =====================================================

    // Admin só pode excluir educadores
    // da própria escola
    if (authenticatedUser.role === "admin") {
      if (
        !authenticatedUser.schoolId ||
        !educator.schoolId ||
        authenticatedUser.schoolId.toString() !==
          educator.schoolId.toString()
      ) {
        return NextResponse.json(
          {
            error:
              "Você não pode excluir um educador de outra escola.",
          },
          { status: 403 }
        );
      }
    }

    // =====================================================
    // EXCLUI SESSÕES DO EDUCADOR
    // =====================================================

    await sessions.deleteMany({
      userId: educator._id,
    });

    // =====================================================
    // EXCLUI EDUCADOR
    // =====================================================

    await users.deleteOne({
      _id: educator._id,
    });

    return NextResponse.json({
      message:
        "Educador excluído com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao excluir educador:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao excluir educador.",
      },
      { status: 500 }
    );
  }
}
