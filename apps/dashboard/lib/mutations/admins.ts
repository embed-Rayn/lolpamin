import type { Admin, PrismaClient } from "@lolpamin/db";
import { hashPassword } from "@/lib/auth/password";

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;

export interface CreateAdminInput {
  username: string;
  password: string;
  createdById: string | null;
}

export async function createAdmin(prisma: PrismaClient, input: CreateAdminInput): Promise<Admin> {
  const username = input.username.trim();

  if (username.length < MIN_USERNAME_LENGTH) {
    throw new Error(`아이디는 ${MIN_USERNAME_LENGTH}자 이상이어야 합니다`);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`);
  }

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) {
    throw new Error("이미 사용 중인 아이디입니다");
  }

  return prisma.admin.create({
    data: {
      username,
      passwordHash: await hashPassword(input.password),
      createdById: input.createdById,
    },
  });
}

export async function deleteAdmin(
  prisma: PrismaClient,
  targetId: string,
  actingAdminId: string
): Promise<void> {
  if (targetId === actingAdminId) {
    throw new Error("자기 자신은 삭제할 수 없습니다");
  }

  // count()와 delete()를 하나의 트랜잭션으로 묶는다. 그러지 않으면 두 관리자가 동시에
  // 서로 다른 대상을 삭제할 때 둘 다 total = 2를 보고 통과해버려, 관리자가 0명이 되고
  // 데이터베이스를 직접 조작하는 것 외에는 복구할 방법이 없어질 수 있다.
  await prisma.$transaction(async (tx) => {
    const total = await tx.admin.count();
    if (total <= 1) {
      throw new Error("마지막 관리자는 삭제할 수 없습니다");
    }

    await tx.admin.delete({ where: { id: targetId } });
  });
}
