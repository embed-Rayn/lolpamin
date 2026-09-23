// OP.GG-style board for one replay-imported game: each team's five players with champion,
// spells, runes, KDA, damage, wards, CS and items, and the teams' objectives between them.
// Purely presentational — both /match-history and the /replay-import preview feed it a GameDetail.
import { compareLane, kdaRatio, killParticipation, summarizeReplayTeams, type TeamSummary } from "@lolpamin/core";
import type { GameDetail, GameDetailPlayer } from "@/lib/game-detail/types";
import {
  championIcon,
  championName,
  itemIcon,
  itemName,
  runeIcon,
  runeName,
  spellIcon,
  spellName,
} from "@/lib/ddragon/assets";

const TEAMS = ["BLUE", "RED"] as const;
type TeamSide = (typeof TEAMS)[number];

const TEAM_LABEL: Record<TeamSide, string> = { BLUE: "블루팀", RED: "레드팀" };

// Desktop columns: player | KDA | damage | wards | CS | items.
const GRID = "grid grid-cols-[minmax(0,1fr)_112px_150px_72px_80px_214px] items-center gap-x-3";

const RIFT_OBJECTIVES: Array<[keyof TeamSummary, string]> = [
  ["baron", "바론"],
  ["dragon", "용"],
  ["herald", "전령"],
  ["horde", "유충"],
  ["atakhan", "아타칸"],
  ["turret", "포탑"],
  ["inhibitor", "억제기"],
];
// ARAM has no epic monsters; only structures mean anything there.
const ARAM_OBJECTIVES = RIFT_OBJECTIVES.filter(([key]) => key === "turret" || key === "inhibitor");

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function Icon({ src, title, className }: { src: string | null; title: string; className: string }) {
  // An id the committed patch does not know is drawn as an empty square, never a broken image.
  if (src === null) return <span className={`inline-block bg-ink/[.08] ${className}`} title={title} />;
  return <img src={src} alt={title} title={title} loading="lazy" className={className} />;
}

function ratioClass(ratio: string): string {
  if (ratio === "Perfect") return "text-orange";
  const value = Number(ratio);
  if (value >= 5) return "text-orange";
  if (value >= 3) return "text-success-soft";
  return "text-muted";
}

function MemberLine({ player }: { player: GameDetailPlayer }) {
  if (player.member === null) return <span className="text-faint">#{player.tagLine}</span>;
  const { name, mmrBefore, mmrAfter } = player.member;
  if (mmrAfter === null) {
    return (
      <span>
        {name} · <span className="font-mono">{mmrBefore}</span>
      </span>
    );
  }
  const delta = mmrAfter - mmrBefore;
  return (
    <span>
      {name} ·{" "}
      <span className="font-mono">
        {mmrBefore}→{mmrAfter}
      </span>{" "}
      <span className={`font-mono ${delta >= 0 ? "text-success-soft" : "text-danger-soft"}`}>
        ({delta > 0 ? `+${delta}` : delta})
      </span>
    </span>
  );
}

function Portrait({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    <div className={`relative flex-none ${box}`}>
      <Icon src={championIcon(player.champion)} title={championName(player.champion)} className={`${box} rounded-full`} />
      <span className="absolute -bottom-1 -right-1 rounded-full bg-page px-1 font-mono text-[10px] leading-4 text-fg-2">
        {player.level}
      </span>
    </div>
  );
}

function Spells({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-[19px] w-[19px]" : "h-4 w-4";
  return (
    <div className="flex flex-none flex-col gap-0.5">
      <Icon src={spellIcon(player.spell1)} title={spellName(player.spell1)} className={`${box} rounded`} />
      <Icon src={spellIcon(player.spell2)} title={spellName(player.spell2)} className={`${box} rounded`} />
    </div>
  );
}

function Runes({ player }: { player: GameDetailPlayer }) {
  return (
    <div className="flex flex-none flex-col gap-0.5">
      <Icon src={runeIcon(player.keystone)} title={runeName(player.keystone)} className="h-[19px] w-[19px] rounded-full bg-page" />
      <Icon src={runeIcon(player.subStyle)} title={runeName(player.subStyle)} className="h-[19px] w-[19px] p-0.5" />
    </div>
  );
}

function Items({ player, size }: { player: GameDetailPlayer; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-7 w-7" : "h-6 w-6";
  return (
    <div className="flex gap-0.5">
      {player.items.map((id, slot) => (
        <Icon key={slot} src={itemIcon(id)} title={itemName(id)} className={`${box} rounded`} />
      ))}
    </div>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const width = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-sm bg-ink/[.08]">
      <div className={`h-full rounded-sm ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

interface RowContext {
  teamKills: number;
  minutes: number;
  maxDealt: number;
  maxTaken: number;
}

function DesktopRow({ player, ctx }: { player: GameDetailPlayer; ctx: RowContext }) {
  const ratio = kdaRatio(player.kills, player.deaths, player.assists);
  return (
    <div className={`${GRID} px-4 py-2`}>
      <div className="flex min-w-0 items-center gap-2">
        <Portrait player={player} size="lg" />
        <Spells player={player} size="lg" />
        <Runes player={player} />
        <div className="min-w-0 pl-1">
          <div className="truncate text-[13.5px] font-bold text-fg">{player.gameName}</div>
          <div className="truncate text-[12px] text-muted">
            <MemberLine player={player} />
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="font-mono text-[12.5px] text-fg-2">
          {player.kills}/{player.deaths}/{player.assists}{" "}
          <span className="text-faint">({killParticipation(player.kills, player.assists, ctx.teamKills)}%)</span>
        </div>
        <div className={`font-mono text-[12.5px] font-bold ${ratioClass(ratio)}`}>
          {ratio === "Perfect" ? ratio : `${ratio}:1`}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11.5px] text-muted">
        <span className="text-center">{formatNumber(player.damageDealt)}</span>
        <span className="text-center">{formatNumber(player.damageTaken)}</span>
        <Bar value={player.damageDealt} max={ctx.maxDealt} className="bg-danger" />
        <Bar value={player.damageTaken} max={ctx.maxTaken} className="bg-ink/[.35]" />
      </div>
      <div className="text-center font-mono text-[12px] text-muted">
        <div>{player.controlWards}</div>
        <div>
          {player.wardsPlaced} / {player.wardsKilled}
        </div>
      </div>
      <div className="text-center font-mono text-[12px] text-muted">
        <div>{player.cs}</div>
        <div>분당 {ctx.minutes === 0 ? 0 : Math.round((player.cs / ctx.minutes) * 10) / 10}</div>
      </div>
      <Items player={player} size="lg" />
    </div>
  );
}

function MobileRow({ player, ctx }: { player: GameDetailPlayer; ctx: RowContext }) {
  const ratio = kdaRatio(player.kills, player.deaths, player.assists);
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Portrait player={player} size="sm" />
        <Spells player={player} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-fg">{player.gameName}</div>
          <div className="truncate text-[11.5px] text-muted">
            <MemberLine player={player} />
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="font-mono text-[12px] text-fg-2">
            {player.kills}/{player.deaths}/{player.assists}
          </div>
          <div className={`font-mono text-[11.5px] font-bold ${ratioClass(ratio)}`}>
            {ratio === "Perfect" ? ratio : `${ratio}:1`}
            <span className="ml-1 font-normal text-faint">
              {killParticipation(player.kills, player.assists, ctx.teamKills)}%
            </span>
          </div>
        </div>
      </div>
      <div className="pl-10">
        <Items player={player} size="sm" />
      </div>
    </div>
  );
}

function TeamBlock({
  team,
  detail,
  players,
  ctx,
}: {
  team: TeamSide;
  detail: GameDetail;
  players: GameDetailPlayer[];
  ctx: RowContext;
}) {
  const won = detail.winner === team;
  const tint = won ? "bg-accent/[.07]" : "bg-danger/[.07]";
  const header = (
    <>
      <span className={`font-bold ${won ? "text-accent-soft" : "text-danger-soft"}`}>{won ? "승리" : "패배"}</span>{" "}
      <span className="text-faint">({TEAM_LABEL[team]})</span>
    </>
  );
  return (
    <div>
      <div className="hidden md:block">
        <div className={`${GRID} border-b border-ink/[.06] px-4 py-2 text-[12.5px] text-faint`}>
          <div>{header}</div>
          <div className="text-center">KDA</div>
          <div className="text-center">피해량</div>
          <div className="text-center">와드</div>
          <div className="text-center">CS</div>
          <div className="text-center">아이템</div>
        </div>
        <div className={`divide-y divide-ink/[.05] ${tint}`}>
          {players.map((p) => (
            <DesktopRow key={p.puuid} player={p} ctx={ctx} />
          ))}
        </div>
      </div>
      <div className="md:hidden">
        <div className="border-b border-ink/[.06] px-3 py-2 text-[12.5px]">{header}</div>
        <div className={`divide-y divide-ink/[.05] ${tint}`}>
          {players.map((p) => (
            <MobileRow key={p.puuid} player={p} ctx={ctx} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Objectives({ summary, objectives, align }: { summary: TeamSummary; objectives: typeof RIFT_OBJECTIVES; align: "start" | "end" }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted ${align === "end" ? "md:justify-end" : ""}`}>
      {objectives.map(([key, label]) => (
        <span key={key}>
          {label} <span className="font-mono text-fg-2">{summary[key]}</span>
        </span>
      ))}
    </div>
  );
}

function VersusBar({ label, blue, red }: { label: string; blue: number; red: number }) {
  const total = blue + red;
  const bluePct = total === 0 ? 50 : Math.round((blue / total) * 100);
  return (
    <div className="relative flex h-6 overflow-hidden rounded text-[12px] font-bold text-white">
      <div className="flex items-center bg-accent pl-2" style={{ width: `${bluePct}%` }}>
        {formatNumber(blue)}
      </div>
      <div className="flex flex-1 items-center justify-end bg-danger pr-2">{formatNumber(red)}</div>
      <span className="absolute inset-0 flex items-center justify-center">{label}</span>
    </div>
  );
}

export function GameDetailBoard({ detail }: { detail: GameDetail }) {
  const summary = summarizeReplayTeams(detail.players);
  const objectives = detail.mode === "ARAM" ? ARAM_OBJECTIVES : RIFT_OBJECTIVES;
  const minutes = detail.gameLengthMs / 60000;
  const maxDealt = Math.max(0, ...detail.players.map((p) => p.damageDealt));
  const maxTaken = Math.max(0, ...detail.players.map((p) => p.damageTaken));
  const teamPlayers = (team: TeamSide) => detail.players.filter((p) => p.team === team).sort(compareLane);
  const ctx = (team: TeamSide): RowContext => ({ teamKills: summary[team].kills, minutes, maxDealt, maxTaken });

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[.07] bg-surface">
      <TeamBlock team="BLUE" detail={detail} players={teamPlayers("BLUE")} ctx={ctx("BLUE")} />
      <div className="grid grid-cols-1 items-center gap-2 border-y border-ink/[.06] bg-surface-2 px-4 py-3 md:grid-cols-[1fr_2fr_1fr]">
        <Objectives summary={summary.BLUE} objectives={objectives} align="start" />
        <div className="flex flex-col gap-1.5">
          <VersusBar label="총 킬" blue={summary.BLUE.kills} red={summary.RED.kills} />
          <VersusBar label="총 골드" blue={summary.BLUE.gold} red={summary.RED.gold} />
        </div>
        <Objectives summary={summary.RED} objectives={objectives} align="end" />
      </div>
      <TeamBlock team="RED" detail={detail} players={teamPlayers("RED")} ctx={ctx("RED")} />
    </div>
  );
}
