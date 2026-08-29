import { describe, expect, it } from "vitest";
import { parseKakaoExport } from "./parse-export";

describe("parseKakaoExport", () => {
  it("returns an empty array for text with no messages", () => {
    expect(parseKakaoExport("게임구인방 님과 카카오톡 대화\n저장한 날짜 : 2026-08-29 22:58:30\n")).toEqual([]);
  });

  it("extracts a single mention with the message's timestamp and raw text", () => {
    const text = [
      "게임구인방 님과 카카오톡 대화",
      "저장한 날짜 : 2026-08-29 22:58:30",
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 9:05] @이서준/96/뚜비뚜밥#뚜비얌",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result).toEqual([
      {
        mentionedNickname: "이서준/96/뚜비뚜밥#뚜비얌",
        mentionedAt: new Date(2026, 7, 29, 9, 5),
        rawMessage: "@이서준/96/뚜비뚜밥#뚜비얌",
      },
    ]);
  });

  it("converts 오전/오후 hours to 24-hour time, including the 12 o'clock edge case", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 12:15] @을/1",
      "[갑] [오전 6:00] @을/2",
      "[갑] [오후 12:30] @을/3",
      "[갑] [오후 6:45] @을/4",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result.map((m) => m.mentionedAt.getHours())).toEqual([0, 6, 12, 18]);
  });

  it("extracts every @-line from a multi-line message, all sharing the message's timestamp", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[김민준/94/늑 대#1003] [오전 12:46] 🔥도파민충전🔥",
      "게임 : 자랭",
      "모집시간 : 다 모이시면 시작 ~~",
      "티어 :   ALL",
      "",
      "1. @이서준/96/뚜비뚜밥#뚜비얌",
      "2. @박지현/95/사육사#1003",
      "3. @김민준/94/늑 대#1003",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.mentionedNickname)).toEqual([
      "이서준/96/뚜비뚜밥#뚜비얌",
      "박지현/95/사육사#1003",
      "김민준/94/늑 대#1003",
    ]);
    expect(new Set(result.map((m) => m.mentionedAt.getTime())).size).toBe(1);
    expect(result[0].rawMessage).toContain("게임 : 자랭");
    expect(result[0].rawMessage).toContain("3. @김민준/94/늑 대#1003");
  });

  it("keeps an internal space in a mentioned nickname intact", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] 1. @김민준/94/늑 대#1003",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result[0].mentionedNickname).toBe("김민준/94/늑 대#1003");
  });

  it("extracts a mention from a numbered list line like '1. @닉네임' — the recruitment-post convention", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] 게임 : 자랭",
      "1. @이서준/96/뚜비뚜밥#뚜비얌",
      "2. @박지현/95/사육사#1003",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result.map((m) => m.mentionedNickname)).toEqual([
      "이서준/96/뚜비뚜밥#뚜비얌",
      "박지현/95/사육사#1003",
    ]);
  });

  it("appends a header-less notice line (e.g. a deleted message) to the previous message without producing a spurious mention", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @을/1",
      "메시지가 삭제되었습니다.",
      "[갑] [오전 9:05] @을/2",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result.map((m) => m.mentionedNickname)).toEqual(["을/1", "을/2"]);
    expect(result[0].rawMessage).toContain("삭제되었습니다");
    expect(result[1].rawMessage).toBe("@을/2");
  });

  it("starts a new day when a date separator line appears, shifting later message timestamps", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오전 9:00] @을/1",
      "--------------- 2026년 8월 30일 일요일 ---------------",
      "[갑] [오전 9:00] @을/2",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result[0].mentionedAt.getDate()).toBe(29);
    expect(result[1].mentionedAt.getDate()).toBe(30);
  });

  it("parses an @-line with no #태그 suffix too (accepted noise, not filtered)", () => {
    const text = [
      "--------------- 2026년 8월 29일 토요일 ---------------",
      "[갑] [오후 5:30] @태그해서 작성해주세요",
    ].join("\n");

    const result = parseKakaoExport(text);

    expect(result).toEqual([
      {
        mentionedNickname: "태그해서 작성해주세요",
        mentionedAt: new Date(2026, 7, 29, 17, 30),
        rawMessage: "@태그해서 작성해주세요",
      },
    ]);
  });
});
