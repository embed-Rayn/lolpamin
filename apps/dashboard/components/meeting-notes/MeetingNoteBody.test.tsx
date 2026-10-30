import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MeetingNoteBody } from "./MeetingNoteBody";

const checkboxes = (html: string) => [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]);

describe("MeetingNoteBody", () => {
  it("keeps checkboxes disabled without a toggle handler", () => {
    const html = renderToStaticMarkup(<MeetingNoteBody body="- [ ] a" imageIds={[]} meetingDate="2026-10-30" />);
    expect(checkboxes(html)).toHaveLength(1);
    expect(checkboxes(html)[0]).toContain("disabled");
  });

  it("enables checkboxes of extractable tasks only when a handler is given", () => {
    const html = renderToStaticMarkup(
      <MeetingNoteBody body={"- [ ] a\n\n> - [ ] quoted"} imageIds={[]} meetingDate="2026-10-30" onToggleTask={() => {}} />,
    );
    const [task, quoted] = checkboxes(html);
    expect(task).not.toContain("disabled");
    expect(quoted).toContain("disabled");
  });

  it("marks block elements with their 0-based source line", () => {
    const html = renderToStaticMarkup(<MeetingNoteBody body={"# 제목\n\n문단\n- 항목"} imageIds={[]} />);
    expect(html).toMatch(/<h2[^>]*data-line="0"/);
    expect(html).toMatch(/<p[^>]*data-line="2"/);
    expect(html).toMatch(/<ul[^>]*data-line="3"/);
  });
});
