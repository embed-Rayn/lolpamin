import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 인증 없이 호출될 수 있어야 하는 액션. 여기에 이름을 추가하는 것은
// "이 액션은 누구나 호출해도 안전하다"는 명시적 선언이다.
const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction"]);

const DASHBOARD_ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".superpowers"]);

function findSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) return [];
      return findSourceFiles(join(directory, entry.name));
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [join(directory, entry.name)];
  });
}

// 주석을 "같은 길이의" 공백/개행으로 치환한다. 문자열/템플릿 리터럴 내부는 건드리지 않는다.
// 길이를 그대로 보존하므로, 이후 계산하는 모든 문자열 인덱스가 원본 소스와 그대로 대응된다.
function blankComments(source: string): string {
  let result = "";
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (state === "line") {
      result += c === "\n" ? "\n" : " ";
      if (c === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        result += "  ";
        i++;
        state = "code";
        continue;
      }
      result += c === "\n" ? "\n" : " ";
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      const quote = state === "single" ? "'" : state === "double" ? '"' : "`";
      result += c;
      if (c === "\\") {
        result += next ?? "";
        i++;
        continue;
      }
      if (c === quote) state = "code";
      continue;
    }

    // state === "code"
    if (c === "/" && next === "/") {
      result += "  ";
      i++;
      state = "line";
      continue;
    }
    if (c === "/" && next === "*") {
      result += "  ";
      i++;
      state = "block";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      state = c === "'" ? "single" : c === '"' ? "double" : "template";
      result += c;
      continue;
    }
    result += c;
  }

  return result;
}

function findMatchingParenEnd(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 선언의 매개변수 목록 다음에 오는, 실제 함수 본문을 여는 "{"를 찾는다.
// 매개변수 목록의 괄호(그 안의 구조분해 "{}" 포함)와 반환 타입 표기를 건너뛴다.
function findBodyOpenBrace(source: string, searchFrom: number): number {
  let i = searchFrom;
  while (i < source.length && /\s/.test(source[i])) i++;

  if (source[i] === "(") {
    const closeParen = findMatchingParenEnd(source, i);
    if (closeParen === -1) return -1;
    return source.indexOf("{", closeParen + 1);
  }

  // 괄호 없는 화살표 함수 매개변수(예: `async input => {`)를 위한 대비.
  const arrowIndex = source.indexOf("=>", i);
  if (arrowIndex === -1) return -1;
  return source.indexOf("{", arrowIndex + 2);
}

interface Declaration {
  name: string;
  index: number;
  bodyOpenBrace: number;
}

function findDeclarations(source: string): Declaration[] {
  const declarations: Declaration[] = [];

  // export default async function NAME( ... 이름 없는(named export가 없는) default export도 허용한다.
  for (const match of source.matchAll(/export\s+default\s+async\s+function\s*(\w+)?\s*\(/g)) {
    const parenIndex = match.index! + match[0].length - 1;
    declarations.push({
      name: match[1] ?? "(default export)",
      index: match.index!,
      bodyOpenBrace: findBodyOpenBrace(source, parenIndex),
    });
  }

  for (const match of source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)) {
    const parenIndex = match.index! + match[0].length - 1;
    declarations.push({
      name: match[1],
      index: match.index!,
      bodyOpenBrace: findBodyOpenBrace(source, parenIndex),
    });
  }

  for (const match of source.matchAll(/export\s+const\s+(\w+)\s*(?::\s*[^=]+?)?=\s*async\b/g)) {
    const searchFrom = match.index! + match[0].length;
    declarations.push({
      name: match[1],
      index: match.index!,
      bodyOpenBrace: findBodyOpenBrace(source, searchFrom),
    });
  }

  return declarations.sort((a, b) => a.index - b.index);
}

const actionFiles = findSourceFiles(DASHBOARD_ROOT).filter((file) => /["']use server["']/.test(readFileSync(file, "utf-8")));

// 가드 호출 자체. 대입에 바인딩되어도(`const acting = await requireAdmin();`) 인정한다 —
// 중요한 건 "첫 줄인가"가 아니라 "데이터를 건드리기 전에 실행되는가"다.
const GUARD_PATTERN = /(?:(?:const|let)\s+\w+\s*=\s*)?await\s+requireAdmin\s*\(\s*\)\s*;/;

// 가드보다 먼저 나오면 안 되는 것들: 실제 데이터 접근(prisma.* 또는 이 코드베이스의 관례대로
// 클라이언트를 인자로 넘기는 뮤테이션 헬퍼 호출, 예: `deleteMember(prisma, id)`)과, 그 결과에
// 기반한 부수효과/탈출(revalidatePath, redirect, return). 이 중 하나라도 가드보다 앞에 있으면
// "가드 없이도 여기까지는 실행된다"는 뜻이므로 실패시킨다.
const MARKER_PATTERN = /prisma\.|revalidatePath\(|redirect\(|\breturn\b|\b\w+\(\s*prisma\b/;

// 이 인식기가 특정 액션에 귀속시킬 수 없는 재수출(re-export) 형태.
// `export { bad };` 같은 export 목록이나, `export default someIdentifier;`처럼
// 이름 있는 함수 선언이 아닌 default export가 여기 해당한다. 이런 형태가 있으면
// 그 안에 가드 없는 액션이 숨어 있어도 조용히 통과할 수 있으므로, 발견하는 즉시 실패시킨다.
const UNATTRIBUTABLE_REEXPORT_PATTERN = /\bexport\s*\{|\bexport\s+default\s+\w+\s*;/;

describe("server action guards", () => {
  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(actionFiles)("every exported action in %s calls requireAdmin before touching data", (file) => {
    const source = blankComments(readFileSync(file, "utf-8"));

    // 인식된 선언이 하나 이상 있더라도, 그 옆에 이 인식기가 귀속시킬 수 없는 재수출 형태가
    // 있으면 그 안에 숨은 가드 없는 액션이 조용히 넘어갈 수 있다. 인식된 선언 존재 여부와
    // 무관하게 항상 검사한다.
    expect(
      UNATTRIBUTABLE_REEXPORT_PATTERN.exec(source),
      `${file} contains a re-export form (an \`export { ... }\` list, or \`export default <identifier>\`) that this recognizer cannot attribute to a specific action — the recognizer needs to learn this form`,
    ).toBeNull();

    const declarations = findDeclarations(source);

    // "use server" 파일인데 인식된 선언이 하나도 없다면, 그 파일에 정말 액션이 없거나
    // (드문 경우) 인식기가 아직 모르는 선언 형태를 쓰고 있다는 뜻이다. 어느 쪽이든
    // 조용히 통과시키지 않고 사람이 확인하도록 실패시킨다.
    expect(
      declarations.length,
      `${file} has a "use server" directive but no recognized exported async declaration was found — either it truly has no actions, or the recognizer needs to learn a new declaration form`,
    ).toBeGreaterThan(0);

    for (let i = 0; i < declarations.length; i++) {
      const decl = declarations[i];
      if (PUBLIC_ACTIONS.has(decl.name)) continue;

      expect(decl.bodyOpenBrace, `could not locate the function body of ${decl.name} in ${file}`).toBeGreaterThan(-1);

      const nextIndex = declarations[i + 1]?.index ?? source.length;
      const body = source.slice(decl.bodyOpenBrace + 1, nextIndex);

      const guardMatch = GUARD_PATTERN.exec(body);
      const markerMatch = MARKER_PATTERN.exec(body);
      const failureMessage = `${decl.name} in ${file} must call \`await requireAdmin()\` (optionally bound, e.g. \`const acting = await requireAdmin();\`) before any data access or return`;

      expect(guardMatch, failureMessage).not.toBeNull();

      if (guardMatch && markerMatch) {
        expect(markerMatch.index > guardMatch.index, failureMessage).toBe(true);
      }

      // 가드가 `if` 같은 블록 안에 들어가 있으면, 그 블록이 실행되지 않는 경로에서는
      // 가드가 전혀 실행되지 않는다. 본문의 여는 중괄호부터 가드가 매치된 지점까지
      // 중괄호 깊이가 0이어야(=본문 최상위여야) 한다.
      if (guardMatch) {
        let depth = 0;
        for (let i = 0; i < guardMatch.index; i++) {
          if (body[i] === "{") depth++;
          else if (body[i] === "}") depth--;
        }
        expect(
          depth,
          `${decl.name} in ${file} calls \`requireAdmin()\` only inside a nested block (e.g. an \`if\`) — the guard must run unconditionally at the top level of the action body`,
        ).toBe(0);
      }
    }
  });
});
