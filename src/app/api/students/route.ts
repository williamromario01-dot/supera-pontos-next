import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      user.role !== "super_admin" &&
      user.role !== "admin" &&
      user.role !== "educator"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para acessar os alunos.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const query: Record<string, unknown> = {
      role: "student",
    };

    /*
     * SUPORTE:
     * Pode visualizar todos os alunos do sistema,
     * inclusive alunos que ainda não possuem escola.
     */
    if (user.role === "super_admin") {
      // Nenhum filtro adicional.
    } else {
      /*
       * ADMINISTRADOR E EDUCADOR:
       * Só podem visualizar alunos da própria escola.
       */
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma escola.",
          },
          { status: 403 }
        );
      }

      query.schoolId = user.schoolId;
    }

    const students = await db
      .collection("users")
      .find(query)
      .project({
        passwordHash: 0,
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      students: students.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        points: student.points || 0,
        schoolId: student.schoolId
          ? String(student.schoolId)
          : null,
        createdAt: student.createdAt || null,
      })),
    });
  } catch (error) {
    console.error("Erro ao carregar alunos:", error);

    return NextResponse.json(
      {
        error:
          "Erro interno ao carregar os alunos.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    /*
     * Somente Administrador e Educador cadastram alunos
     * dentro da própria escola.
     *
     * O Suporte não cadastra alunos diretamente por esta tela.
     */
    if (
      user.role !== "admin" &&
      user.role !== "educator"
    ) {
      return NextResponse.json(
        {
          error:
            "Somente Administrador e Educador podem cadastrar alunos.",
        },
        { status: 403 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json(
        {
          error:
            "Seu usuário não está vinculado a uma escola.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return NextResponse.json(
        {
          error:
            "Nome, e-mail e senha são obrigatórios.",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error:
            "A senha deve ter pelo menos 6 caracteres.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const existingUser = await db
      .collection("users")
      .findOne({ email });

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Já existe um usuário cadastrado com este e-mail.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      role: "student",
      schoolId: user.schoolId,
      points: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      {
        message: "Aluno cadastrado com sucesso.",
        student: {
          id: result.insertedId.toString(),
          name,
          email,
          points: 0,
          schoolId: String(user.schoolId),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao cadastrar aluno:", error);

    return NextResponse.json(
      {
        error:
          "Erro interno ao cadastrar o aluno.",
      },
      { status: 500 }
    );
  }
}
