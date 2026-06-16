import {
  App,
  ItemView,
  WorkspaceLeaf,
  TFile,
  setIcon,
  Notice,
  Platform,
  MarkdownView,
  Menu,
  normalizePath,
} from "obsidian";
import type DeskleafPlugin from "./main";
import type { CalendarEvent, EventUpdate } from "./types";
import { isFeedEvent } from "./ical-feed-manager";
import {
  toDateStr,
  toTimeStr,
  get1DayColumn,
  getNDayColumns,
  getWeekColumns,
  weekHeaderLabel,
  dayHeaderLabel,
  rangeHeaderLabel,
  addDays,
  parseDate,
  shortDayLabel,
  getWeekNumber,
} from "./date-utils";
import type { DayColumn } from "./date-utils";
import { openFile } from "./open-file";
import {
  HOUR_PX,
  assignColumns,
  topFromISO,
  heightFromISO,
  snapMins,
  minsToTimeStr,
  minsToISO,
} from "./event-layout";
import type { EventLayout } from "./event-layout";

export const VIEW_TYPE_CALENDAR = "deskleaf-calendar";

const CAL_HUES = [346, 21, 48, 96, 188, 252];

interface DailyNoteConfig {
  folder: string;
  template: string;
  format: string;
}

function getDailyNoteConfig(app: App): DailyNoteConfig {
  const pn = (app as any).plugins?.getPlugin?.("periodic-notes");
  const pnDaily = pn?.settings?.daily;
  if (pnDaily?.enabled) {
    return {
      folder: (pnDaily.folder ?? "").replace(/\/+$/, ""),
      template: pnDaily.template ?? "",
      format: pnDaily.format || "YYYY-MM-DD",
    };
  }
  const dn = (app as any).internalPlugins?.getPluginById?.("daily-notes");
  if (dn?.enabled) {
    const o = dn.instance?.options ?? {};
    return {
      folder: (o.folder ?? "").replace(/\/+$/, ""),
      template: o.template ?? "",
      format: o.format || "YYYY-MM-DD",
    };
  }
  return { folder: "Journal", template: "", format: "YYYY-MM-DD" };
}

async function applyDailyTemplate(
  app: App,
  templatePath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any,
): Promise<string> {
  if (!templatePath) return "";
  const p = normalizePath(templatePath.endsWith(".md") ? templatePath : `${templatePath}.md`);
  const f = app.vault.getAbstractFileByPath(p);
  if (!(f instanceof TFile)) return "";
  let content = await app.vault.read(f);
  content = content.replace(/\{\{date(?::([^}]*))?\}\}/g, (_: string, fmt: string) =>
    m.format(fmt || "YYYY-MM-DD"),
  );
  content = content.replace(/\{\{title\}\}/g, m.format("YYYY-MM-DD"));
  content = content.replace(
    /\{\{time\}\}/g,
    (window as any).moment().format("HH:mm"),
  );
  return content;
}

type Selection =
  | { kind: "event"; id: string; seriesTitle: string | null }
  | { kind: "date"; date: string }
  | null;

const DESKLEAF_SVG_PATH =
  "M11.945,40.638C15.831,40.266 28.662,30.675 29.528,29.942C30.947,28.741 32.043,27.809 32.97,26.959" +
  "C34.372,25.676 35.389,24.584 36.556,23.045C37.214,22.177 37.92,21.167 38.771,19.9" +
  "C37.735,21.006 36.661,22.067 35.55,23.086C34.973,23.615 34.387,24.133 33.791,24.639" +
  "C31.029,26.987 28.061,29.099 24.92,31.012C23.203,32.057 21.435,33.043 19.619,33.974" +
  "C13.698,33 9.175,27.859 9.175,21.672C9.175,14.791 14.77,9.204 21.661,9.204L49.052,9.204" +
  "L49.052,35.513C49.052,42.395 43.457,47.982 36.566,47.982C30.155,47.982 24.866,43.146 24.16,36.931" +
  "L24.08,37.048C24.08,37.048 17.148,42.54 13.712,43.8C13.077,44.032 11.683,42.31 11.945,40.638Z";

function deskleafIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd">` +
    `<g transform="translate(0.414023,0.934705)">` +
    `<path fill="currentColor" d="${DESKLEAF_SVG_PATH}"/>` +
    `</g></svg>`
  );
}

function todayIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round">` +
    `<path fill="currentColor" d="M9,14L7,14L10,10L8,13L9,13L9,14ZM10,10L13,14L11,14L11,13L12,13L10,10Z"/>` +
    `<path fill="currentColor" d="M11,13L11,18L9,18L9,13L8,13L10,10L12,13L11,13Z"/>` +
    `<path fill="currentColor" d="M10,7C10.552,7 11,7.448 11,8C11,8.552 10.552,9 10,9C9.448,9 9,8.552 9,8C9,7.448 9.448,7 10,7ZM13,15L16,15L16,6L4,6L4,15L7,15L7,16.042L4,16.042C3.425,16.042 2.958,15.575 2.958,15L2.958,4C2.958,3.425 3.425,2.958 4,2.958L16,2.958C16.575,2.958 17.042,3.425 17.042,4L17.042,15C17.042,15.575 16.575,16.042 16,16.042L13,16.042L13,15Z"/>` +
    `</svg>`
  );
}

const TEAMS_SVG_PATH =
  "M36.559,19.452C36.51,19.138 36.484,18.816 36.484,18.488C36.484,15.107 39.229,12.361 42.61,12.361C45.5,12.361 47.926,14.367 48.57,17.061C48.679,17.519 48.737,17.997 48.737,18.488C48.737,21.869 45.992,24.615 42.61,24.615C39.919,24.615 37.63,22.875 36.809,20.46C36.698,20.135 36.614,19.798 36.559,19.452Z" +
  "M14.549,39.964C14.545,39.892 14.543,39.82 14.543,39.747L14.543,31.141C14.543,28.767 16.471,26.839 18.846,26.839L28.977,26.839C31.352,26.839 33.28,28.767 33.28,31.141L33.28,39.305C33.28,44.229 36.985,48.295 41.758,48.864C41.401,48.909 41.038,48.932 40.669,48.932L23.202,48.932C18.423,48.932 14.543,45.052 14.543,40.273C14.543,40.17 14.545,40.067 14.549,39.964Z" +
  "M34.727,31.614C35.162,30.516 36.234,29.739 37.485,29.739L46.363,29.739C47.999,29.739 49.327,31.067 49.327,32.704L49.327,38.633C49.327,38.84 49.306,39.042 49.266,39.236C49.307,39.576 49.327,39.922 49.327,40.273C49.327,44.473 46.331,47.978 42.361,48.766C37.9,47.928 34.521,44.008 34.521,39.305L34.521,32.704C34.521,32.319 34.594,31.952 34.727,31.614Z" +
  "M23.523,7.194C27.955,7.194 31.553,10.792 31.553,15.224C31.553,19.656 27.955,23.255 23.523,23.255C19.091,23.255 15.492,19.656 15.492,15.224C15.492,10.792 19.091,7.194 23.523,7.194Z";

const MEET_SVG_PATH =
  "M14,5L14,15L14,15C13.448,15 13,14.552 13,14C13,12.084 13,7.916 13,6C13,5.448 13.448,5 14,5C14,5 14,5 14,5Z" +
  "M14,15L14,15.243C14,15.709 13.815,16.156 13.485,16.485C13.156,16.815 12.709,17 12.243,17L3.278,17C2.812,17 2.365,16.815 2.035,16.485C1.706,16.156 1.521,15.709 1.521,15.243L1.521,7.858C1.521,5.175 3.696,3 6.378,3L12.243,3C12.709,3 13.156,3.185 13.485,3.515C13.815,3.844 14,4.291 14,4.757L14,5C13.448,5 13,5.448 13,6L13,14C13,14.552 13.448,15 14,15Z" +
  "M14,7.75L16.797,5.652C17.214,5.339 17.772,5.289 18.239,5.522C18.705,5.755 19,6.232 19,6.754L19,13.966C19,14.506 18.684,14.996 18.192,15.22C17.7,15.443 17.123,15.358 16.717,15.002L14,12.625L14,7.75Z" +
  "M4.5,12C3.672,12 3,12.672 3,13.5C3,14.328 3.672,15 4.5,15C5.328,15 6,14.328 6,13.5C6,12.672 5.328,12 4.5,12Z";

const JITSI_SVG_PATH =
  "M45.4181 23.2445C45.0316 22.4169 44.4086 21.7223 43.6277 21.2487C42.6993 20.6602 41.5397 20.5354 40.7313 20.5354C40.4591 20.5354 40.1871 20.5495 39.9163 20.5776H39.8961C39.9105 20.4663 39.9393 20.3223 39.9633 20.2051C40.0037 19.9997 40.0497 19.7664 40.0757 19.5235C40.1832 18.4819 39.8126 17.0803 39.1301 15.9543C39.0216 15.7747 39.0254 15.7133 39.0254 15.7133C39.0596 15.6624 39.0995 15.6157 39.1445 15.5741L39.2069 15.5088C40.8206 13.7808 41.3083 11.881 40.6545 9.85058C39.4152 6.00002 39.083 6.00002 38.8401 6.00002C38.786 5.99948 38.7323 6.01041 38.6827 6.03209C38.633 6.05376 38.5886 6.08569 38.5521 6.12578C38.5118 6.1746 38.4823 6.23142 38.4656 6.29249C38.4489 6.35356 38.4454 6.41747 38.4552 6.48002C38.5809 7.75682 38.2929 9.58466 38.1009 10.2807C37.8657 11.1562 37.0449 12.4618 34.4529 13.7031C34.2709 13.7806 34.0851 13.8489 33.8961 13.9075C33.0504 14.1907 31.6373 14.664 30.852 15.745C30.2597 16.4391 30.1166 17.1341 29.8603 18.3888C29.6318 19.5043 29.4475 20.8627 29.8085 22.4842C29.8449 22.6445 29.8795 22.7789 29.9112 22.8989C29.9333 22.9843 29.9525 23.0583 29.9669 23.1226L29.9976 23.1159L29.9659 23.1245C29.9899 23.2205 29.9745 23.2435 29.94 23.2675C29.8153 23.3169 29.6869 23.3564 29.556 23.3856C29.172 23.4471 28.788 23.5152 28.4213 23.5872C27.2539 23.7879 23.7249 24.3965 22.0997 26.9837C21.0965 28.5792 20.9544 30.6634 21.6753 33.1853C22.4232 35.6813 23.9073 37.3968 24.923 37.7462L24.9393 37.752C25.0123 37.7846 25.0824 37.8125 25.1505 37.8355C25.1505 37.9056 25.1438 37.991 25.1352 38.087C25.1281 38.1293 25.1214 38.1754 25.115 38.2253C25.0037 39.0394 24.6197 39.9168 24.228 39.9398C24.0216 39.8995 23.2037 39.4358 22.6248 39.0557C22.4392 38.9347 22.2632 38.8189 22.0968 38.7082C20.4811 37.6387 19.5902 37.0502 18.2289 36.8986C18.1824 36.8936 18.1356 36.891 18.0888 36.8909C16.6488 36.8909 14.0568 39.3158 14.0021 44.1485C13.9742 46.5696 14.2277 48.7824 14.7576 50.7264C15.1358 52.1203 15.539 52.9142 15.6561 53.1264L16.1227 54L16.3358 53.04C17.459 47.952 18.8453 46.7261 21.1521 45.2592C22.8427 46.8432 25.0632 47.6784 27.5918 47.6784C29.723 47.6784 31.9531 47.0592 33.8693 45.9341C35.7518 44.8301 37.2053 43.3421 38.0933 41.6227C38.2411 41.7187 38.4197 41.8435 38.5377 41.9261C38.9601 42.2218 39.0494 42.2842 39.2001 42.2842H39.2136C39.3787 42.2774 40.9358 41.7552 42.5304 39.8074C43.4568 38.6755 44.2209 37.2758 44.8008 35.6448C45.5189 33.6288 45.9528 31.248 46.1006 28.5706C46.2638 26.3223 46.0353 24.5319 45.4219 23.2493L45.4181 23.2445ZM39.4449 10.3027C39.5788 10.8426 39.5962 11.4049 39.4958 11.952C39.3461 13.0157 38.8949 13.968 38.1249 14.8368C38.7811 13.3969 39.2257 11.8698 39.4449 10.3027V10.3027ZM38.3313 16.9047C38.5659 17.2594 38.7449 17.6479 38.8622 18.0567C38.9924 18.5927 38.9691 19.1546 38.795 19.6781C38.5195 20.3338 38.1499 20.665 37.6958 20.665H37.6353C37.4753 20.6409 37.3219 20.5847 37.1841 20.4999C36.6005 20.1581 36.2846 19.2519 36.5121 18.5875C36.5217 18.5683 36.5304 18.5482 36.539 18.5271C36.5765 18.4311 36.683 18.2467 36.9787 17.9616C37.4011 17.5882 38.0184 17.1168 38.3294 16.9056L38.3313 16.9047ZM31.5729 16.7242L31.5787 16.7136V16.704C31.7035 16.3968 32.5627 15.8995 33.1329 15.5703C33.204 15.528 33.275 15.4867 33.3461 15.4464C33.5958 15.3153 33.8522 15.1971 34.1141 15.0922C35.052 14.6928 36.5141 14.0707 37.7179 12.912C37.3685 14.137 36.5275 16.2 35.1451 17.449C34.8379 17.7264 34.2177 17.9722 33.4987 18.2563C32.724 18.5616 31.7928 18.9283 30.8894 19.4823C30.9595 18.7757 31.1774 17.5431 31.5681 16.7242H31.5729ZM30.9729 20.7159C31.4376 20.3319 32.2881 19.8115 35.075 18.8919C35.0942 18.9783 35.1163 19.0896 35.1374 19.2C35.1547 19.2835 35.1729 19.3786 35.1941 19.4823C35.3765 20.3827 35.5781 21.3946 37.4529 21.9562C37.2782 22.3402 36.9192 22.9891 36.7944 23.113L36.7531 23.1485L36.7243 23.1955C36.3595 23.7811 34.3877 25.0589 33.5045 25.0589C33.4665 25.0593 33.4286 25.0564 33.3912 25.0503C32.8593 24.9475 31.6382 23.8627 31.2792 23.0611C30.5851 21.4877 30.7272 20.9203 30.9681 20.7197L30.9729 20.7159ZM24.0293 35.1581C23.0078 33.6384 22.2341 30.983 22.7409 28.848V28.8384C22.9857 27.6768 23.7969 26.9933 24.132 26.7533L24.18 26.7178C24.6773 26.2839 25.6949 25.8259 27.0465 25.4256C27.2385 25.3757 27.3441 25.3536 27.3489 25.3536C27.5976 25.3018 27.8693 25.2394 28.1333 25.1789C28.6328 25.0513 29.1392 24.9523 29.6501 24.8823C29.7768 24.8688 29.9054 24.8448 30.0283 24.8208C30.1944 24.7844 30.3634 24.7625 30.5333 24.7555C30.6688 24.7483 30.8031 24.7839 30.9173 24.8573C31.4184 25.4525 32.6453 26.6275 33.4497 26.6967H33.4737H33.5006C34.4165 26.6477 35.8517 25.7539 37.7678 24.0384C38.0933 23.7504 38.3957 23.4989 38.6923 23.2791L38.7288 23.2512C39.2517 22.8546 39.8275 22.533 40.4395 22.296C40.2389 22.9527 40.0795 24.0749 40.7275 25.656C41.0645 26.4739 41.7115 28.3171 42.2481 30.1219C43.1717 33.2304 43.043 33.7776 43.0248 33.8285C42.9992 33.9341 42.9574 34.0351 42.9009 34.128C42.8289 34.1141 42.7593 34.0895 42.6945 34.055C42.2289 33.84 41.7067 33.456 41.0961 33.0048C39.9633 32.1744 38.555 31.1414 36.4939 30.336C34.98 29.7456 33.4747 29.4451 32.0222 29.4451C31.4203 29.4441 30.8198 29.5013 30.2289 29.616C26.9822 30.2563 25.2705 31.6877 24.3518 32.4576L24.3451 32.4634C24.2847 32.5123 24.2409 32.5787 24.2198 32.6534C24.1987 32.7282 24.2012 32.8077 24.227 32.881C24.2535 32.9531 24.3017 33.0152 24.365 33.0587C24.4283 33.1022 24.5035 33.125 24.5803 33.1238C24.6638 33.1238 24.7454 33.1008 25.0152 33.023C25.988 32.7332 26.9835 32.5257 27.9912 32.4029C28.3522 32.3608 28.7154 32.3393 29.0789 32.3386C30.6504 32.3386 32.0961 32.8186 33.6264 33.8582C33.9768 34.151 34.1909 34.345 34.3205 34.4726L34.188 34.5072L33.2597 34.7693C30.9614 35.4192 27.4872 36.4013 25.8427 36.4013C25.7166 36.4023 25.5906 36.3949 25.4654 36.3792C25.0392 36.3168 24.5189 35.8714 24.036 35.159L24.0293 35.1581ZM17.2507 46.8173C16.6038 47.6606 16.1274 48.6219 15.8481 49.6474C15.539 48.1661 15.1761 45.7296 15.3825 43.8326C15.8126 39.9024 17.7595 38.5862 18.0485 38.5171H18.0667C18.083 38.5171 18.1022 38.5171 18.1406 38.5584C18.2961 38.7274 18.6321 39.4406 18.3873 42.3907C18.3297 42.9984 18.4757 43.513 18.8232 43.92C19.0586 44.1892 19.3548 44.3985 19.6872 44.5306C18.7501 45.1495 17.9249 45.923 17.2469 46.8182L17.2507 46.8173ZM20.5598 42.96C20.4584 43.0054 20.3492 43.0308 20.2382 43.0349C20.1992 43.0383 20.1599 43.0329 20.1233 43.0189C20.0867 43.0049 20.0538 42.9828 20.027 42.9542C19.9646 42.889 19.8235 42.6662 19.8686 42.0086C19.9003 41.6851 19.9454 41.3626 19.9877 41.0486C20.0819 40.4573 20.1384 39.8606 20.1566 39.2621C21.2913 40.0051 22.5489 40.7923 23.363 41.1552C22.8312 41.6266 21.7243 42.4742 20.5598 42.9619V42.96ZM35.3678 42.8544C33.5373 44.7625 31.0651 45.9252 28.428 46.1184C28.115 46.1414 27.803 46.153 27.5025 46.153C24.0302 46.153 22.2657 44.6794 21.4545 43.8586C25.3781 42.1661 26.1739 39.7459 26.5214 38.689C26.555 38.5862 26.5857 38.497 26.6174 38.4202C26.7672 38.3453 27.2433 38.1322 28.7121 37.5821C29.8641 37.1674 31.2456 36.7027 32.4638 36.2918C33.4785 35.9501 34.355 35.6534 34.8341 35.4778L34.8734 35.4653C34.9694 35.4384 35.027 35.4259 35.0654 35.4192L35.0923 35.4538C35.5387 36.0355 36.275 36.3898 36.2817 36.3946C36.8353 36.6416 37.4273 36.791 38.0318 36.8362C38.0174 38.9338 37.0593 41.1091 35.3736 42.8534L35.3678 42.8544ZM38.411 35.6726C36.9585 35.6726 36.4488 35.2051 35.9736 34.6397C33.6149 31.8278 31.0075 31.367 29.9947 31.2989C29.6702 31.2778 29.3525 31.2672 29.0481 31.2672C28.7928 31.2672 28.5432 31.2739 28.2993 31.2893C29.4742 30.8898 30.7064 30.6849 31.9473 30.6826C34.5489 30.6826 37.0536 31.6042 39.3893 33.4205C40.3416 34.1606 41.0424 34.6858 41.6481 35.1072C41.3531 35.1949 40.9547 35.3069 40.4529 35.4432L40.2609 35.496C39.651 35.6044 39.0333 35.6635 38.4139 35.6726H38.411ZM39.3163 40.9901C39.1637 40.8557 38.9323 40.6416 38.6933 40.4237C38.9129 39.8647 39.0788 39.2861 39.1886 38.6957C39.3019 38.0726 39.3729 37.2557 39.4056 36.8227C40.0954 36.7196 40.7783 36.5744 41.4504 36.3878C42.2597 36.1555 42.8846 35.8915 43.3301 35.591C41.9409 39.0595 39.9288 40.583 39.3163 40.9882V40.9901ZM44.123 33.0576C43.9166 31.3478 43.2245 29.2339 42.9537 28.4122C42.9249 28.3162 42.9009 28.2471 42.8846 28.1962C42.8645 28.1309 42.8021 27.9571 42.6734 27.6019C42.3403 26.6717 41.6453 24.7383 41.5214 24.1661C41.3438 23.3251 41.7451 22.1683 42.0014 22.0675C42.0806 22.0378 42.1645 22.0225 42.2491 22.0224C42.7214 22.0224 43.3051 22.4688 43.7669 23.1888C44.3256 24.0528 44.6568 25.1981 44.7 26.4039C44.796 29.0352 44.5521 31.2336 44.124 33.0576";

const OBSIDIAN_CRYSTAL_PATH =
  "M81.51,113.142C77.224,100.428 68.787,88.592 56.086,77.69C57.878,70.513 59.011,63.747 59.752,56.2C59.927,54.467 60.752,52.864 62.061,51.715L99.945,18.451L99.948,18.449C101.417,17.409 102.852,16.819 104.31,16.892C105.768,16.965 107.179,17.699 108.62,18.985L108.889,19.299C108.922,19.65 109.016,20.002 109.176,20.339C116.205,35.165 108.377,44.34 102.176,56.007C95.454,68.657 89.887,83.809 101.148,109.39C94.994,109.554 88.442,110.788 81.51,113.142Z" +
  "M83.215,119.164C97.31,114.312 109.638,114.464 120.011,119.516C130.921,124.829 139.581,135.467 145.98,150.874C142.81,158.115 140.446,165.737 139.034,173.808C136.642,177.28 134.315,179.514 131.78,180.645C129.355,181.727 126.784,181.714 123.923,181.01C106.624,174.701 91.855,172.967 74.985,172.103C83.678,154.237 86.598,137.582 83.833,122.18C83.651,121.169 83.445,120.164 83.215,119.164Z" +
  "M118.203,30.221C126.119,39.504 136.712,51.93 141.315,57.335L141.317,57.336C142.328,58.522 142.908,60.015 142.964,61.573L142.964,61.584C143.764,81.984 149.552,101.269 161.563,116.978L161.57,116.987C163.424,119.393 163.414,122.75 161.546,125.145L161.545,125.146C156.981,131.005 152.943,137.111 149.542,143.516C142.671,129.132 133.631,119.197 122.747,113.896C118.212,111.688 113.344,110.272 108.157,109.683C93.966,79.875 104.285,65.188 111.698,51.687C115.511,44.743 118.585,38.067 118.203,30.221Z" +
  "M54.254,84.407C67.319,96.244 75.149,109.182 77.681,123.284C80.251,137.597 77.364,153.046 69.228,169.65L38.205,136.993C36.653,135.359 36.196,132.971 37.036,130.88C45.349,110.269 50.734,96.363 54.254,84.407Z";

function obsidianCrystalIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 200 200" style="display:block;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round">` +
    `<path fill="currentColor" d="${OBSIDIAN_CRYSTAL_PATH}"/>` +
    `</svg>`
  );
}

function teamsIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd">` +
    `<g transform="translate(-2.4078,0.458041)">` +
    `<path fill="currentColor" d="${TEAMS_SVG_PATH}"/>` +
    `</g></svg>`
  );
}

function meetIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle;flex-shrink:0">` +
    `<path fill="currentColor" d="${MEET_SVG_PATH}"/>` +
    `</svg>`
  );
}

function jitsiIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0">` +
    `<path fill="currentColor" d="${JITSI_SVG_PATH}"/>` +
    `</svg>`
  );
}

export function locationIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round">` +
    `<g transform="matrix(1,0,0,1,0,-1)"><path d="M18,4L2,10L9,12L11,19L18,4Z" style="fill:none;stroke:currentColor;stroke-width:1.25px"/></g>` +
    `</svg>`
  );
}

export function clockIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round">` +
    `<circle cx="10" cy="10" r="8" style="fill:none;stroke:currentColor;stroke-width:1.25px"/>` +
    `<g transform="matrix(1,0,0,1,0,1)"><path d="M14,5L10,9L8,7" style="fill:none;stroke:currentColor;stroke-width:1.25px"/></g>` +
    `</svg>`
  );
}

// ── Time grid constants ──────────────────────────────────────────────
const DAY_START = 0;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;

// Minimum column width in px — drives how many days fit
const MIN_COL_W = 120;
const GUTTER_W = 44;

// All-day row: max visible height (≈1.5 event rows), then scroll
const ALLDAY_MAX_H = 30;

// ── View ─────────────────────────────────────────────────────────────

export class DeskleafCalendarView extends ItemView {
  plugin: DeskleafPlugin;
  private anchor: Date = new Date();
  private visibleDays: number = 3;
  private selection: Selection = null;
  private get selectedEventId() { return this.selection?.kind === "event" ? this.selection.id : null; }
  private get selectedDate() { return this.selection?.kind === "date" ? this.selection.date : null; }
  private get selectedSeriesTitle() { return this.selection?.kind === "event" ? this.selection.seriesTitle : null; }
  private noteCache: Map<string, TFile> = new Map();
  private unsubscribeData: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private nowTimer: number | null = null;
  private lastAnchorStr: string | null = null;
  private lastVisibleDays: number = 0;
  private initialScrollDone = false;
  private navLabelEl: HTMLElement | null = null;
  private dragCreate: {
    ghost: HTMLElement;
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private dragMove: {
    ghost: HTMLElement;
    landing: HTMLElement;
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private dragResize: {
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private hoverEl: HTMLElement | null = null;
  private hoverTimer: number | null = null;
  private carouselTracks: HTMLElement[] = [];
  private slideDir: number = 0;
  private desktopSlideZone: HTMLElement | null = null;
  private preserveScrollForNextRender: number | null = null;
  private mobileEdit: { event: CalendarEvent; cleanup: () => void } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeskleafPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  private calendarHue(name: string): number {
    // 1. CalDAV saved color
    const saved = this.plugin.settings.caldav.calendarColors?.[name];
    if (saved !== undefined) return saved;
    // 2. iCal feed: check by label
    const feed = this.plugin.settings.icalSubscriptions?.find(f => f.label === name);
    if (feed?.color !== undefined) return feed.color;
    // 3. Fallback: hash-based round-robin
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return CAL_HUES[h % CAL_HUES.length];
  }

  getViewType() {
    return VIEW_TYPE_CALENDAR;
  }
  getDisplayText() {
    return "Deskleaf";
  }
  getIcon() {
    return "deskleaf-calendar";
  }

  setAnchor(date: Date) {
    this.anchor = new Date(date);
    this.animatedRender(0);
  }

  setAnchorAndVisibleDays(date: Date, days: number) {
    this.anchor = new Date(date);
    this.visibleDays = Math.min(6, Math.max(1, days));
    this.render();
  }

  async onOpen() {
    this.unsubscribeData = this.plugin.calendarReader.onChange(() =>
      this.render(),
    );
    this.addAction("calendar", "Heute", () => {
      this.anchor = new Date();
      this.animatedRender(0);
    });
    this.buildNavBar(this.containerEl.children[0] as HTMLElement);
    this.setupResizeObserver();
    this.setupActiveLeafTracking();
    this.nowTimer = window.setInterval(() => this.tickNowLine(), 60_000);
    this.render();
  }

  async onClose() {
    this.unsubscribeData?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.nowTimer !== null) {
      window.clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
    this.cancelDrag();
    this.hideHoverPopover();
    this.exitMobileEditMode();
  }

  private computeInitialScroll(): { top: number; hasEvents: boolean } {
    const allDates = this.getColumnsForOffset(0).flatMap((c) => c.dates);
    let earliest: number | null = null;
    for (const date of allDates) {
      for (const ev of this.plugin.calendarReader.getEventsForDate(date)) {
        const d = new Date(ev.start);
        const h = d.getHours() + d.getMinutes() / 60;
        if (earliest === null || h < earliest) earliest = h;
      }
    }
    const top = (earliest !== null ? Math.max(0, earliest - 0.5) : 8) * HOUR_PX;
    return { top, hasEvents: earliest !== null };
  }

  private render() {
    const anchorStr = toDateStr(this.anchor);
    // Keep the sidebar mini calendar in sync: anchor + the full visible range
    const visibleDates = this.getColumnsForOffset(0).flatMap((c) => c.dates);
    this.app.workspace.trigger("deskleaf:anchor-changed" as any, anchorStr, visibleDates);
    const rangeChanged =
      anchorStr !== this.lastAnchorStr ||
      this.visibleDays !== this.lastVisibleDays;
    if (rangeChanged) {
      this.lastAnchorStr = anchorStr;
      this.lastVisibleDays = this.visibleDays;
      this.initialScrollDone = false;
    }

    // Only preserve user scroll position once we've scrolled to the first event
    const shouldPreserveScroll = this.initialScrollDone && !rangeChanged;
    const swipeScroll = this.preserveScrollForNextRender;
    this.preserveScrollForNextRender = null;
    const prevScroll = swipeScroll !== null ? swipeScroll
      : shouldPreserveScroll
        ? (this.containerEl.querySelector<HTMLElement>(".dl-grid-body-scroll")?.scrollTop ?? null)
        : null;

    this.noteCache = this.plugin.noteManager.buildNoteCache();
    this.updateNavLabel();

    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("dl-root");
    const wrapper = root.createDiv("dl-calendar-wrapper");
    this.buildStatusBar(wrapper);
    this.buildTimeGrid(wrapper);
    if (Platform.isMobile) this.buildMobileTodayFab(wrapper);
    // Apply slide animation to the slide zone only (gutter stays fixed)
    const zone = this.desktopSlideZone;
    if (this.slideDir !== 0 && !Platform.isMobile && zone) {
      zone.classList.add(this.slideDir > 0 ? "dl-slide-in-right" : "dl-slide-in-left");
    }
    setTimeout(() => {
      const scrollEl = this.containerEl.querySelector<HTMLElement>(
        ".dl-grid-body-scroll",
      );
      if (!scrollEl) return;
      if (prevScroll !== null) {
        scrollEl.scrollTop = prevScroll;
      } else {
        const { top, hasEvents } = this.computeInitialScroll();
        scrollEl.scrollTop = top;
        if (hasEvents) this.initialScrollDone = true;
      }
    }, 0);
  }

  // ── Responsive width ─────────────────────────────────────────────

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const width =
        entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
      const n = Math.min(
        6,
        Math.max(1, Math.floor((width - GUTTER_W) / MIN_COL_W)),
      );
      if (n !== this.visibleDays) {
        this.visibleDays = n;
        this.render();
      }
    });
    this.resizeObserver.observe(this.containerEl);
  }

  // ── Active note tracking ─────────────────────────────────────────

  private setupActiveLeafTracking() {
    // active-leaf-change fires on every tab switch, including already-open tabs
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const file = ((leaf?.view as any)?.file as TFile | null) ?? null;
        this.syncSelectionToFile(file);
      }),
    );
    // Cache fallback: leaf may become active before metadata is indexed
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.app.workspace.getActiveFile() === file)
          this.syncSelectionToFile(file);
      }),
    );
  }

  private syncSelectionToFile(file: TFile | null) {
    // null = non-file view (file explorer, calendar itself, etc.) — keep existing highlight
    if (!file) return;

    const config = getDailyNoteConfig(this.app);
    const folderPrefix = config.folder ? config.folder + "/" : "";
    if (!folderPrefix || file.path.startsWith(folderPrefix)) {
      const m = (window as any).moment(file.basename, config.format, true);
      if (m.isValid()) {
        const date: string = m.format("YYYY-MM-DD");
        if (this.selection?.kind !== "date" || this.selection.date !== date) {
          this.selection = { kind: "date", date };
          this.render();
        }
        return;
      }
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = fm?.["event-id"];
    const ids: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

    if (ids.length === 0) {
      this.clearSelection();
      return;
    }

    const date = fm?.date as string | undefined;
    const title = fm?.title as string | undefined;
    const allEvents = this.plugin.calendarReader.getEvents();
    const event =
      allEvents.find((e) => ids.includes(e.id)) ??
      (date && title
        ? allEvents.find((e) => e.title === title && e.start.slice(0, 10) === date)
        : undefined);
    if (!event) return;

    if (event.id !== this.selectedEventId) {
      this.applySelection(event);
      this.render();
    }
  }

  private applySelection(event: CalendarEvent) {
    const titleCount = this.plugin.calendarReader.getEvents()
      .filter((e) => e.title === event.title).length;
    this.selection = {
      kind: "event",
      id: event.id,
      seriesTitle: titleCount > 1 ? event.title : null,
    };
  }

  private clearSelection() {
    if (this.selection !== null) {
      this.selection = null;
      this.render();
    }
  }

  // ── Nav bar ──────────────────────────────────────────────────────

  private buildNavBar(header: HTMLElement) {
    const addBtn = (parent: HTMLElement, label: string, icon: string | null, svgHtml: string | null, cb: () => void) => {
      const btn = parent.createEl("button", { cls: "clickable-icon view-header-nav-button" });
      btn.setAttribute("aria-label", label);
      if (svgHtml) btn.createEl("span").innerHTML = svgHtml;
      else if (icon) setIcon(btn, icon);
      btn.addEventListener("click", cb);
      return btn;
    };

    const navBtns = header.querySelector<HTMLElement>(".view-header-nav-buttons");
    if (navBtns) {
      navBtns.empty();
      addBtn(navBtns, "Zurück", "arrow-left", null, () => this.navigate(-1));
      addBtn(navBtns, "Heute", null, todayIconSvg(16), () => {
        const today = new Date();
        const dir = toDateStr(today) === toDateStr(this.anchor) ? 0
          : today > this.anchor ? 1 : -1;
        this.anchor = today;
        this.animatedRender(dir);
      });
      addBtn(navBtns, "Weiter", "arrow-right", null, () => this.navigate(1));
    }

    // Mobil: Obsidian zeigt view-header-nav-buttons manchmal nicht an —
    // dann werden die Buttons direkt neben dem Titel eingefügt.
    if (Platform.isMobile && !navBtns) {
      const titleEl = header.querySelector<HTMLElement>(".view-header-title-container") ?? header;
      const bar = titleEl.createDiv("dl-mobile-nav-bar");
      addBtn(bar, "Zurück", "arrow-left", null, () => this.navigate(-1));
      this.navLabelEl = bar.createEl("span", { cls: "dl-mobile-nav-label" });
      addBtn(bar, "Heute", null, todayIconSvg(14), () => { this.anchor = new Date(); this.render(); });
      addBtn(bar, "Weiter", "arrow-right", null, () => this.navigate(1));
      this.updateNavLabel();
      return;
    }

    this.navLabelEl = header.querySelector<HTMLElement>(".view-header-title");
    this.updateNavLabel();
  }

  private updateNavLabel() {
    if (!this.navLabelEl) return;
    this.navLabelEl.textContent =
      this.visibleDays === 1
        ? dayHeaderLabel(this.anchor)
        : this.visibleDays === 6
          ? weekHeaderLabel(this.anchor)
          : rangeHeaderLabel(
              this.anchor,
              addDays(this.anchor, this.visibleDays - 1),
            );
  }

  private buildStatusBar(el: HTMLElement) {
    const error = this.plugin.calendarReader.getLoadError();
    if (error) {
      const isCache = error.includes("Cache vom");
      el.createDiv({
        cls: `dl-status-bar ${isCache ? "dl-status-bar--warn" : "dl-status-bar--error"}`,
        text: isCache ? `⚠ ${error}` : `Fehler: ${error}`,
      });
      return;
    }
    if (this.plugin.calendarReader.getEvents().length === 0) {
      el.createDiv({
        cls: "dl-status-bar dl-status-bar--warn",
        text: `Keine Events. Pfad: ${this.plugin.calendarReader.getPath()}`,
      });
    }
    // iCal feed warnings
    const warnFeeds = this.plugin.icalFeedManager?.getWarnFeeds() ?? [];
    if (warnFeeds.length > 0) {
      const names = warnFeeds.map(f => f.label).join(", ");
      el.createDiv({
        cls: "dl-status-bar dl-status-bar--warn",
        text: `⚠ Feed-Fehler: ${names}`,
      });
    }
  }

  private navigate(dir: number) {
    if (Platform.isMobile && this.visibleDays <= 3) {
      this.anchor = dir > 0 ? this.mobileNext(this.anchor) : this.mobilePrev(this.anchor);
      this.render();
    } else {
      const step = this.visibleDays === 6 ? 7 : this.visibleDays;
      this.anchor = addDays(this.anchor, dir * step);
      this.animatedRender(dir);
    }
  }

  // Vorwärts: Sa → Mo (+2), sonst +1
  private mobileNext(a: Date): Date {
    return a.getDay() === 6 ? addDays(a, 2) : addDays(a, 1);
  }
  // Rückwärts: Mo → Sa (−2), sonst −1
  private mobilePrev(a: Date): Date {
    return a.getDay() === 1 ? addDays(a, -2) : addDays(a, -1);
  }

  // Spaltenfolge für Mobile-Carousel: N = visibleDays + 2, jeweils 1 DayColumn
  private mobileColSequence(): DayColumn[] {
    const N = this.visibleDays + 2;
    const seq: DayColumn[] = [];
    let cur = this.mobilePrev(this.anchor);
    for (let i = 0; i < N; i++) {
      seq.push(getNDayColumns(cur, 1)[0]);
      cur = this.mobileNext(cur);
    }
    return seq;
  }

  private animatedRender(dir: number) {
    if (Platform.isMobile || dir === 0) {
      this.render();
      return;
    }

    // Detach old slide zone before render() clears the DOM
    const oldSlideZone = this.containerEl
      .querySelector<HTMLElement>(".dl-slide-zone");
    if (oldSlideZone) oldSlideZone.remove();

    this.slideDir = dir;
    this.render();
    this.slideDir = 0;

    if (oldSlideZone) {
      const grid = this.containerEl.querySelector<HTMLElement>(".dl-time-grid--desktop");
      if (grid) {
        // Overlay old slide zone for exit animation — positioned over the slide column
        oldSlideZone.style.cssText +=
          `;position:absolute;top:0;left:${GUTTER_W}px;right:0;bottom:0;z-index:4;pointer-events:none;`;
        oldSlideZone.classList.add(dir > 0 ? "dl-slide-out-left" : "dl-slide-out-right");
        grid.appendChild(oldSlideZone);
        setTimeout(() => oldSlideZone.remove(), 260);
      }
    }
  }

  // ── Time grid ────────────────────────────────────────────────────

  private getColumnsForOffset(offset: number): DayColumn[] {
    const step = this.visibleDays === 6 ? 7 : this.visibleDays;
    const shifted = addDays(this.anchor, offset * step);
    return this.visibleDays === 6
      ? getWeekColumns(shifted)
      : this.visibleDays === 1
        ? get1DayColumn(shifted)
        : getNDayColumns(shifted, this.visibleDays);
  }

  private buildHeadersInto(container: HTMLElement, columns: DayColumn[], today: string) {
    for (const col of columns) {
      if (col.dates.length === 2) {
        const group = container.createDiv("dl-day-header dl-day-header--double");
        for (const date of col.dates) {
          let cls = "dl-day-subheader";
          if (date === today) cls += " dl-day-header--today";
          if (date === this.selectedDate) cls += " dl-day-header--selected";
          const cell = group.createDiv(cls);
          cell.setText(shortDayLabel(parseDate(date)));
          cell.addEventListener("click", () => this.openDailyNote(date));
        }
      } else {
        const date = col.dates[0];
        let cls = "dl-day-header";
        if (date === today) cls += " dl-day-header--today";
        if (date === this.selectedDate) cls += " dl-day-header--selected";
        const cell = container.createDiv(cls);
        cell.setText(col.label);
        cell.addEventListener("click", () => this.openDailyNote(date));
      }
    }
  }

  private async openDailyNote(date: string) {
    const config = getDailyNoteConfig(this.app);
    const m = (window as any).moment(date, "YYYY-MM-DD");
    const filename = m.format(config.format);
    const path = config.folder
      ? normalizePath(`${config.folder}/${filename}.md`)
      : `${filename}.md`;

    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (config.folder && !this.app.vault.getAbstractFileByPath(config.folder))
        await this.app.vault.createFolder(config.folder);
      const content = await applyDailyTemplate(this.app, config.template, m);
      file = await this.app.vault.create(path, content);
    }
    await openFile(this.app, file as TFile, false);
  }

  private buildBodiesInto(container: HTMLElement, columns: DayColumn[], gridHeight: number, today: string) {
    for (const col of columns) {
      if (col.dates.length === 2) {
        const doubleCol = container.createDiv("dl-day-body dl-day-body--double");
        for (const date of col.dates)
          this.buildDayBody(doubleCol.createDiv("dl-day-body dl-day-body--sub"), date, gridHeight, today);
      } else {
        this.buildDayBody(container.createDiv("dl-day-body"), col.dates[0], gridHeight, today);
      }
    }
  }

  private makeCarouselTrack(viewport: HTMLElement): HTMLElement {
    viewport.addClass("dl-carousel-viewport");
    const track = viewport.createDiv("dl-carousel-track");
    track.createDiv("dl-carousel-panel");
    track.createDiv("dl-carousel-panel");
    track.createDiv("dl-carousel-panel");
    return track;
  }

  private buildTimeGrid(el: HTMLElement) {
    const today = toDateStr(new Date());
    const gridHeight = TOTAL_HOURS * HOUR_PX;

    const grid = el.createDiv("dl-time-grid");

    if (Platform.isMobile && this.visibleDays <= 3) {
      this.carouselTracks = [];

      // Spalten-basierter Carousel: N = visibleDays + 2 Spalten
      // Jede Spalte ist 1/visibleDays der Viewport-Breite.
      // Kein Tag erscheint doppelt während der Animation.
      const N = this.visibleDays + 2;
      const colPct = 100 / N;               // % des Tracks pro Spalte
      const trackW = `${(N / this.visibleDays) * 100}%`;
      const CENTER = `translateX(-${colPct}%)`;

      const colSeq = this.mobileColSequence(); // N DayColumns
      const currentDates = colSeq.slice(1, this.visibleDays + 1).flatMap(c => c.dates);

      // Erstellt einen Track mit N Spalten-Slots
      const makeColTrack = (viewport: HTMLElement): HTMLElement => {
        viewport.addClass("dl-carousel-viewport");
        const track = viewport.createDiv("dl-carousel-track");
        track.style.width = trackW;
        track.style.transform = CENTER;
        for (let i = 0; i < N; i++) {
          const col = track.createDiv("dl-carousel-col");
          col.style.width = `${colPct}%`;
        }
        return track;
      };

      // ── Header row ─────────────────────────────────────────────
      const headerRow = grid.createDiv("dl-grid-header-row");
      const mobileHeaderGutter = headerRow.createDiv("dl-time-gutter");
      mobileHeaderGutter.createDiv({
        cls: "dl-gutter-kw",
        text: `KW ${getWeekNumber(parseDate(colSeq[1].dates[0]))}`,
      });
      const headerTrack = makeColTrack(headerRow.createDiv());
      this.carouselTracks.push(headerTrack);
      for (let i = 0; i < N; i++) {
        this.buildHeadersInto(headerTrack.children[i] as HTMLElement, [colSeq[i]], today);
      }

      // ── All-day row ────────────────────────────────────────────
      const feedAllDay = (this.plugin.icalFeedManager?.getAllEvents() ?? []).filter(e => e.isAllDay);
      const hasAnyAllDay = colSeq.some(col =>
        col.dates.some(d =>
          this.plugin.calendarReader.getAllDayEventsForDate(d).length > 0 ||
          feedAllDay.some(e => e.start.slice(0, 10) <= d && e.end.slice(0, 10) >= d)
        )
      );
      if (hasAnyAllDay) {
        const alldayRow = grid.createDiv("dl-allday-row");
        alldayRow.createDiv("dl-time-gutter dl-allday-label").setText("ganztägig");
        const alldayTrack = makeColTrack(alldayRow.createDiv());
        this.carouselTracks.push(alldayTrack);
        const heights = colSeq.map(col => {
          const tmp = document.createElement("div");
          return this.buildAllDayAreaInto(tmp, [col], col.dates);
        });
        const cappedH = Math.min(Math.max(...heights, 20), ALLDAY_MAX_H);
        for (let i = 0; i < N; i++) {
          const colEl = alldayTrack.children[i] as HTMLElement;
          colEl.style.height = `${cappedH}px`;
          const area = colEl.createDiv("dl-allday-scroll").createDiv("dl-allday-area");
          this.buildAllDayAreaInto(area, [colSeq[i]], colSeq[i].dates);
        }
      }

      // ── Body ───────────────────────────────────────────────────
      const bodyScroll = grid.createDiv("dl-grid-body-scroll");
      const bodyInner = bodyScroll.createDiv("dl-grid-body-inner");

      const gutter = bodyInner.createDiv("dl-time-gutter dl-time-gutter--labels");
      gutter.style.height = `${gridHeight}px`;
      for (let h = DAY_START; h <= DAY_END; h++) {
        const lbl = gutter.createDiv("dl-time-label");
        lbl.style.top = `${(h - DAY_START) * HOUR_PX}px`;
        lbl.setText(`${String(h).padStart(2, "0")}:00`);
      }
      if (currentDates.includes(today)) {
        const nowLbl = gutter.createDiv("dl-now-label");
        const nowD = new Date();
        nowLbl.textContent = `${String(nowD.getHours()).padStart(2,"0")}:${String(nowD.getMinutes()).padStart(2,"0")}`;
        nowLbl.style.top = `${(((nowD.getHours() - DAY_START) * 60 + nowD.getMinutes()) / 60) * HOUR_PX}px`;
      }

      const bodyTrack = makeColTrack(bodyInner.createDiv());
      this.carouselTracks.push(bodyTrack);
      for (let i = 0; i < N; i++) {
        const colEl = bodyTrack.children[i] as HTMLElement;
        colEl.style.height = `${gridHeight}px`;
        this.buildBodiesInto(colEl, [colSeq[i]], gridHeight, today);
      }

      this.setupSwipeGestures(grid, bodyScroll, colPct);

    } else {
      // ── Desktop: CSS-Grid — gutter col (fixed) + slide zone (animates) ──
      grid.addClass("dl-time-grid--desktop");
      const columns = this.getColumnsForOffset(0);
      const allDates = columns.flatMap(c => c.dates);
      const feedAllDayForDesktop = (this.plugin.icalFeedManager?.getAllEvents() ?? []).filter(e => e.isAllDay);
      const hasAllDay = allDates.some(d =>
        this.plugin.calendarReader.getAllDayEventsForDate(d).length > 0 ||
        feedAllDayForDesktop.some(e => e.start.slice(0, 10) <= d && e.end.slice(0, 10) >= d)
      );

      // Left column: always-visible gutter (not part of the slide animation)
      const gutterCol = grid.createDiv("dl-gutter-col");
      const gutterHeaderSpacer = gutterCol.createDiv("dl-gutter-header-spacer");
      gutterHeaderSpacer.createDiv({
        cls: "dl-gutter-kw",
        text: `KW ${getWeekNumber(parseDate(columns[0].dates[0]))}`,
      });
      let gutterAlldaySpacer: HTMLElement | null = null;
      if (hasAllDay) {
        gutterAlldaySpacer = gutterCol.createDiv("dl-gutter-allday-spacer dl-allday-label");
        gutterAlldaySpacer.setText("ganztägig");
      }
      const gutterBodyWrap = gutterCol.createDiv("dl-gutter-body-wrap");
      const gutterLabels = gutterBodyWrap.createDiv("dl-time-gutter dl-time-gutter--labels");
      gutterLabels.style.height = `${gridHeight}px`;
      for (let h = DAY_START; h <= DAY_END; h++) {
        const lbl = gutterLabels.createDiv("dl-time-label");
        lbl.style.top = `${(h - DAY_START) * HOUR_PX}px`;
        lbl.setText(`${String(h).padStart(2, "0")}:00`);
      }
      if (allDates.includes(today)) {
        const nowLabelEl = gutterLabels.createDiv("dl-now-label");
        const nowD = new Date();
        nowLabelEl.textContent = `${String(nowD.getHours()).padStart(2,"0")}:${String(nowD.getMinutes()).padStart(2,"0")}`;
        nowLabelEl.style.top = `${(((nowD.getHours() - DAY_START) * 60 + nowD.getMinutes()) / 60) * HOUR_PX}px`;
      }

      // Right column: content that slides on navigation
      const slideZone = grid.createDiv("dl-slide-zone");
      this.desktopSlideZone = slideZone;

      const headerRow = slideZone.createDiv("dl-grid-header-row");
      this.buildHeadersInto(headerRow, columns, today);

      if (hasAllDay) {
        const alldayScroll = slideZone.createDiv("dl-allday-scroll");
        const alldayArea = alldayScroll.createDiv("dl-allday-area");
        this.buildAllDayAreaInto(alldayArea, columns, allDates);
      }

      const bodyScroll = slideZone.createDiv("dl-grid-body-scroll");
      const bodyInner = bodyScroll.createDiv("dl-grid-body-inner");
      this.buildBodiesInto(bodyInner, columns, gridHeight, today);

      // Sync gutter scroll position with body scroll
      bodyScroll.addEventListener("scroll", () => {
        gutterBodyWrap.scrollTop = bodyScroll.scrollTop;
      }, { passive: true });

      // Match spacer heights to rendered content heights (next frame)
      requestAnimationFrame(() => {
        if (!headerRow.isConnected) return;
        gutterHeaderSpacer.style.height = `${headerRow.offsetHeight}px`;
        if (gutterAlldaySpacer) {
          gutterAlldaySpacer.style.height = `${
            slideZone.querySelector<HTMLElement>(".dl-allday-scroll")?.offsetHeight ?? ALLDAY_MAX_H
          }px`;
        }
        gutterBodyWrap.scrollTop = bodyScroll.scrollTop;
      });
    }

  }

  private setupSwipeGestures(el: HTMLElement, scrollEl: HTMLElement, colPct = 100 / 3) {
    const EDGE_ZONE = 80;
    const THRESHOLD = 40;
    let startX = 0, startY = 0;
    let interior = false;
    let claimedH = false;

    const setTracks = (transform: string, transition = "none") => {
      this.carouselTracks.forEach(t => {
        t.style.transition = transition;
        t.style.transform = transform;
      });
    };

    const CENTER = `translateX(-${colPct}%)`;

    // capture:true → feuert auch wenn eine Event-Card stopPropagation aufruft
    el.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      interior = startX >= EDGE_ZONE && startX <= window.innerWidth - EDGE_ZONE;
      claimedH = false;
      setTracks(CENTER);
    }, { passive: true, capture: true });

    el.addEventListener("touchmove", (e) => {
      if (!interior || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!claimedH && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        claimedH = true;
      }
      if (claimedH) {
        e.stopPropagation();
        e.preventDefault();
        setTracks(`translateX(calc(-${colPct}% + ${dx}px))`);
      }
    }, { passive: false });

    el.addEventListener("touchend", (e) => {
      if (!interior) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (claimedH && Math.abs(dx) > THRESHOLD) {
        e.stopPropagation();
        const dir = dx < 0 ? 1 : -1;
        const target = dir > 0 ? `translateX(-${2 * colPct}%)` : `translateX(0%)`;
        setTracks(target, "transform 260ms cubic-bezier(0.25,0.46,0.45,0.94)");
        setTimeout(() => {
          this.preserveScrollForNextRender = scrollEl.scrollTop;
          this.navigate(dir);
        }, 260);
      } else {
        setTracks(CENTER, "transform 200ms cubic-bezier(0.25,0.46,0.45,0.94)");
      }
      interior = false;
      claimedH = false;
    }, { passive: false });
  }

  private buildAllDayAreaInto(area: HTMLElement, columns: DayColumn[], allDates: string[]): number {
    const ROW_H = 18;
    const totalCols = columns.length;

    const dateFrac = new Map<string, { start: number; end: number }>();
    columns.forEach((col, i) => {
      if (col.dates.length === 2) {
        dateFrac.set(col.dates[0], { start: i, end: i + 0.5 });
        dateFrac.set(col.dates[1], { start: i + 0.5, end: i + 1 });
      } else {
        dateFrac.set(col.dates[0], { start: i, end: i + 1 });
      }
    });

    const seen = new Set<string>();
    const items: Array<{ ev: CalendarEvent; fracStart: number; fracEnd: number }> = [];

    const feedAllDayEvents = (this.plugin.icalFeedManager?.getAllEvents() ?? [])
      .filter(e => e.isAllDay);

    for (const date of allDates) {
      const calEvents = this.plugin.calendarReader.getAllDayEventsForDate(date);
      const feedEventsForDate = feedAllDayEvents.filter(
        e => e.start.slice(0, 10) <= date && e.end.slice(0, 10) >= date
      );
      for (const ev of [...calEvents, ...feedEventsForDate]) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const evStart = ev.start.slice(0, 10);
        const evEnd = ev.end.slice(0, 10);
        let fs = totalCols, fe = 0;
        for (const [d, frac] of dateFrac) {
          if (d >= evStart && d <= evEnd) {
            fs = Math.min(fs, frac.start);
            fe = Math.max(fe, frac.end);
          }
        }
        if (fs < fe) items.push({ ev, fracStart: fs, fracEnd: fe });
      }
    }

    items.sort((a, b) => a.fracStart - b.fracStart || b.fracEnd - b.fracStart - (a.fracEnd - a.fracStart));

    const rowEnds: number[] = [];
    const rowOf = items.map(({ fracStart, fracEnd }) => {
      let row = rowEnds.findIndex((end) => end <= fracStart);
      if (row === -1) { row = rowEnds.length; rowEnds.push(fracEnd); }
      else rowEnds[row] = fracEnd;
      return row;
    });

    const areaH = rowEnds.length * ROW_H + 2;
    area.style.height = `${areaH}px`;

    for (let i = 0; i < totalCols; i++) {
      const sep = area.createDiv("dl-allday-col-sep");
      sep.style.left = `${(i / totalCols) * 100}%`;
    }

    for (let i = 0; i < items.length; i++) {
      const { ev, fracStart, fracEnd } = items[i];
      const row = rowOf[i];
      const chip = area.createDiv("dl-allday-chip");
      chip.style.setProperty("--cal-h", String(this.calendarHue(ev.calendar ?? "")));
      chip.addEventListener("mouseenter", (e) => this.showHoverPopover(e, ev));
      chip.addEventListener("mouseleave", () => this.hideHoverPopover());
      if (ev.id === this.selectedEventId) chip.addClass("dl-allday-chip--selected");
      else if (this.selectedSeriesTitle && ev.title === this.selectedSeriesTitle) chip.addClass("dl-allday-chip--series");
      if (ev.isRecurring) chip.addClass("dl-allday-chip--recurring");
      if (ev.isCancelled) chip.addClass("dl-allday-chip--cancelled");
      chip.style.left = `calc(${(fracStart / totalCols) * 100}% + 3px)`;
      chip.style.top = `${row * ROW_H + 2}px`;
      chip.style.width = `calc(${((fracEnd - fracStart) / totalCols) * 100}% - 6px)`;
      chip.setText(ev.title);
      chip.addEventListener("click", (e) => this.openEvent(ev, e.metaKey || e.ctrlKey));
      chip.addEventListener("contextmenu", (e) => this.showEventContextMenu(e, ev, ev.start.slice(0, 10)));
    }

    return areaH;
  }

  private buildAllDayRowSpanning(grid: HTMLElement, columns: DayColumn[], allDates: string[]) {
    const allDayRow = grid.createDiv("dl-allday-row");
    allDayRow.createDiv("dl-time-gutter dl-allday-label").setText("ganztägig");
    const scroll = allDayRow.createDiv("dl-allday-scroll");
    const area = scroll.createDiv("dl-allday-area");
    this.buildAllDayAreaInto(area, columns, allDates);
  }

  private buildDayBody(
    el: HTMLElement,
    date: string,
    gridHeight: number,
    today: string,
  ) {
    el.dataset.date = date;
    if (date === today) el.addClass("dl-day-body--today");
    if (date === this.selectedDate) el.addClass("dl-day-body--selected");
    el.style.height = `${gridHeight}px`;

    for (let h = 0; h < TOTAL_HOURS; h++) {
      const line = el.createDiv("dl-hour-line");
      line.style.top = `${h * HOUR_PX}px`;
      const half = el.createDiv("dl-hour-line dl-hour-line--half");
      half.style.top = `${h * HOUR_PX + HOUR_PX / 2}px`;
    }

    if (date === today) {
      const now = new Date();
      const topPx =
        (((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60) * HOUR_PX;
      if (topPx >= 0 && topPx <= gridHeight) {
        const nowLine = el.createDiv("dl-now-line");
        nowLine.style.top = `${topPx}px`;
      }
    }

    const feedEventsForDate = (this.plugin.icalFeedManager?.getAllEvents() ?? [])
      .filter(e => !e.isAllDay && e.start.slice(0, 10) <= date && e.end.slice(0, 10) >= date);
    const allEventsForDate = [
      ...this.plugin.calendarReader.getEventsForDate(date),
      ...feedEventsForDate,
    ];
    for (const layout of assignColumns(allEventsForDate)) {
      this.buildEventCard(el, layout.event, layout.col, layout.totalCols, date);
    }

    if (Platform.isMobile)
      el.addEventListener("touchstart", (e) => this.onDayTouchStart(e, el, date), { passive: true });
    else
      el.addEventListener("mousedown", (e) => this.onDayMouseDown(e, el, date));
  }

  private buildEventCard(
    container: HTMLElement,
    event: CalendarEvent,
    col: number,
    totalCols: number,
    date: string,
  ) {
    const gridBottom = TOTAL_HOURS * HOUR_PX;
    const rawTop = topFromISO(event.start);
    const rawBottom = rawTop + heightFromISO(event.start, event.end);

    if (rawBottom <= 0 || rawTop >= gridBottom) return;

    const topPx = Math.max(0, rawTop) + 1;
    const heightPx = Math.min(gridBottom, rawBottom) - topPx - 1;

    const card = container.createDiv("dl-event-card");
    card.style.setProperty("--cal-h", String(this.calendarHue(event.calendar ?? "")));
    card.addEventListener("mouseenter", (e) => this.showHoverPopover(e, event));
    card.addEventListener("mouseleave", () => this.hideHoverPopover());
    card.addEventListener("mousedown", () => this.hideHoverPopover());
    if (event.id === this.selectedEventId)
      card.addClass("dl-event-card--selected");
    else if (
      this.selectedSeriesTitle &&
      event.title === this.selectedSeriesTitle
    )
      card.addClass("dl-event-card--series");
    const noteFile = this.noteCache.get(event.id) ?? null;
    if (noteFile) card.addClass("dl-event-card--has-note");
    if (event.isRecurring) card.addClass("dl-event-card--recurring");
    if (event.isCancelled) card.addClass("dl-event-card--cancelled");
    if ((event as any)._continuesBefore)
      card.addClass("dl-event-card--continues-before");
    if ((event as any)._continuesAfter)
      card.addClass("dl-event-card--continues-after");

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    card.style.top = `${topPx}px`;
    card.style.height = `${heightPx}px`;
    card.style.left = `calc(${pct(col / totalCols)} + 1px)`;
    card.style.width = `calc(${pct(1 / totalCols)} - 3px)`;

    const noteIndicator = card.createDiv("dl-event-note-indicator");
    noteIndicator.addClass(noteFile ? "dl-event-note-indicator--exists" : "dl-event-note-indicator--missing");
    noteIndicator.setAttribute("aria-label", noteFile ? "Notiz vorhanden" : "Notiz fehlt");

    // Check for Teams/Meet/Jitsi early (check Jitsi first to avoid "meet" in "Jitsi Meet")
    const isJitsiCard =
      event.meetingPlatform?.toLowerCase().includes("jitsi") ||
      event.location?.toLowerCase().includes("jitsi") ||
      event.location?.toLowerCase().includes("meet.jit.si");
    const isTeamsCard =
      event.meetingPlatform?.toLowerCase().includes("teams") ||
      event.location?.toLowerCase().includes("teams");
    const isMeetCard =
      !isJitsiCard && (
        event.meetingPlatform?.toLowerCase().includes("meet") ||
        (event.location?.toLowerCase().includes("meet") && event.location?.toLowerCase().includes("google"))
      );

    // 1. Title — always first
    const titleRow = card.createDiv({ cls: "dl-event-title-row" });
    if (isTeamsCard) {
      const iconWrap = titleRow.createSpan({ cls: "dl-event-icon-wrap" });
      iconWrap.innerHTML = teamsIconSvg(8);
    } else if (isMeetCard) {
      const iconWrap = titleRow.createSpan({ cls: "dl-event-icon-wrap" });
      iconWrap.innerHTML = meetIconSvg(8);
    } else if (isJitsiCard) {
      const iconWrap = titleRow.createSpan({ cls: "dl-event-icon-wrap" });
      iconWrap.innerHTML = jitsiIconSvg(8);
    }
    titleRow.createDiv({ cls: "dl-event-title", text: event.title });

    // 2. Location — second (if enough space)
    if (heightPx > 40) {
      if (isTeamsCard) {
        const loc = card.createDiv({ cls: "dl-event-location dl-event-location--teams" });
        loc.innerHTML = teamsIconSvg(10);
      } else if (isMeetCard) {
        const loc = card.createDiv({ cls: "dl-event-location dl-event-location--meet" });
        loc.innerHTML = meetIconSvg(10);
      } else if (isJitsiCard) {
        const loc = card.createDiv({ cls: "dl-event-location dl-event-location--jitsi" });
        loc.innerHTML = jitsiIconSvg(10);
      } else if (event.location) {
        const loc = card.createDiv({ cls: "dl-event-location" });
        const iconWrap = loc.createSpan({ cls: "dl-event-icon-wrap" });
        iconWrap.setAttribute("aria-hidden", "true");
        iconWrap.innerHTML = locationIconSvg(9);
        loc.createSpan({ text: event.location.replace(/\n/g, ", ") });
      }
    }

    // 3. Time — third (start – end, if enough space)
    if (heightPx >= 26) {
      const timeRow = card.createDiv("dl-event-time-row");
      const clockWrap = timeRow.createSpan({ cls: "dl-event-icon-wrap" });
      clockWrap.setAttribute("aria-hidden", "true");
      clockWrap.innerHTML = clockIconSvg(9);
      timeRow.createSpan({
        cls: "dl-event-time",
        text: `${toTimeStr(event.start)} – ${toTimeStr(event.end)}`,
      });
      if (event.isRecurring)
        timeRow.createSpan({ cls: "dl-event-recurring-icon", text: " ↻" });
    }

    if (noteFile) {
      const fm = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
      if (fm?.toBeRemoved)
        card.createDiv({
          cls: "dl-event-removal-hint",
          text: `⏱ ${fm.removalDate ?? ""}`,
        });
    }

    const isReadOnly = !!event.isCancelled || isFeedEvent(event) || !!event.isAllDay;
    const canEdit = !isReadOnly && !Platform.isMobile;

    card.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      this.showEventContextMenu(e, event, date);
    });

    if (Platform.isMobile) {
      this.addEventLongPress(card, event, date);
      let tapTimer: number | null = null;
      let lastTapAt = 0;
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTapAt < 280) {
          if (tapTimer !== null) {
            window.clearTimeout(tapTimer);
            tapTimer = null;
          }
          lastTapAt = 0;
          this.openEvent(event, false);
          return;
        }
        lastTapAt = now;
        if (tapTimer !== null) window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(() => {
          tapTimer = null;
          this.showEventEditPopover(event, date, e, isReadOnly);
        }, 280);
      });
    } else if (canEdit) {
      let wasDrag = false;
      let suppressNextClick = false;
      let clickTimer: number | null = null;

      const topResizeHandle = card.createDiv("dl-resize-handle dl-resize-handle--top");
      topResizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClick = true;
        this.onResizeMouseDown(e, event, date, card, "start");
      });

      const bottomResizeHandle = card.createDiv("dl-resize-handle dl-resize-handle--bottom");
      bottomResizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClick = true;
        this.onResizeMouseDown(e, event, date, card, "end");
      });

      // Drag-to-move: track drag vs click
      card.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest(".dl-resize-handle")) return;
        e.preventDefault();
        e.stopPropagation();
        wasDrag = false;
        this.onEventMoveMouseDown(e, event, date, card, () => {
          wasDrag = true;
          suppressNextClick = true;
        });
      });
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest(".dl-resize-handle") || wasDrag || suppressNextClick) {
          wasDrag = false;
          suppressNextClick = false;
          return;
        }
        if (clickTimer !== null) window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          clickTimer = null;
          this.showEventEditPopover(event, date, e, false);
        }, 220);
      });
      card.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer !== null) {
          window.clearTimeout(clickTimer);
          clickTimer = null;
        }
        this.openEvent(event, e.metaKey || e.ctrlKey);
      });
    } else if (!Platform.isMobile) {
      let clickTimer: number | null = null;
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (clickTimer !== null) window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          clickTimer = null;
          this.showEventEditPopover(event, date, e, true);
        }, 220);
      });
      card.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer !== null) {
          window.clearTimeout(clickTimer);
          clickTimer = null;
        }
        this.openEvent(event, e.metaKey || e.ctrlKey);
      });
    }
  }

  // ── Mobile edit mode ─────────────────────────────────────────────

  private addEventLongPress(cardEl: HTMLElement, event: CalendarEvent, date: string) {
    cardEl.addEventListener("touchstart", (e: TouchEvent) => {
      e.stopPropagation();
      if (!!event.isCancelled || isFeedEvent(event) || !!event.isAllDay) return;
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;
      let fired = false;

      const timer = window.setTimeout(() => {
        fired = true;
        if ((navigator as any).vibrate) (navigator as any).vibrate(12);
        this.enterMobileEditMode(event, date, cardEl);
      }, 350);

      const onMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
          window.clearTimeout(timer);
          cardEl.removeEventListener("touchmove", onMove);
        }
      };
      const onEnd = () => {
        window.clearTimeout(timer);
        cardEl.removeEventListener("touchmove", onMove);
        cardEl.removeEventListener("touchend", onEnd);
        cardEl.removeEventListener("touchcancel", onEnd);
        if (fired) {
          cardEl.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { once: true, capture: true });
        }
      };

      cardEl.addEventListener("touchmove", onMove, { passive: true });
      cardEl.addEventListener("touchend", onEnd);
      cardEl.addEventListener("touchcancel", onEnd);
    }, { passive: true });
  }

  private enterMobileEditMode(event: CalendarEvent, date: string, cardEl: HTMLElement) {
    this.exitMobileEditMode();

    const startMin = new Date(event.start).getHours() * 60 + new Date(event.start).getMinutes();
    const endMin   = new Date(event.end).getHours()   * 60 + new Date(event.end).getMinutes();
    const startDate = toDateStr(new Date(event.start));
    const endDate = toDateStr(new Date(event.end));
    let curStart = startMin;
    let curEnd   = endMin;
    let curDate  = date;

    cardEl.addClass("dl-event-card--editing");
    const topHandle    = cardEl.createDiv("dl-edit-handle dl-edit-handle--top");
    const bottomHandle = cardEl.createDiv("dl-edit-handle dl-edit-handle--bottom");

    const barEl     = document.body.createDiv("dl-mobile-edit-bar");
    const timeLabel = barEl.createDiv("dl-edit-bar-time");
    const actionsEl = barEl.createDiv("dl-edit-bar-actions");

    const updateBar = () => {
      timeLabel.textContent = `${minsToTimeStr(curStart)} – ${minsToTimeStr(curEnd)}`;
    };
    updateBar();

    // Action buttons
    const closeBtn  = actionsEl.createEl("button", { cls: "dl-edit-bar-btn", text: "×" });
    if (!event.isCancelled) {
      const deleteBtn = actionsEl.createEl("button", {
        cls: "dl-edit-bar-btn dl-edit-bar-btn--danger",
        text: event.isOrganizer ? "Löschen" : "Ablehnen",
      });
      deleteBtn.addEventListener("click", async () => {
        cleanup();
        try { await this.plugin.calendarReader.cancelEvent(event.id); }
        catch (err: any) { new Notice(`Fehler: ${err?.message ?? err}`); }
      });
    }
    closeBtn.addEventListener("click", () => cleanup());

    // Refresh card geometry from curStart/curEnd
    const refreshCard = () => {
      cardEl.style.top    = `${(curStart / 60) * HOUR_PX + 1}px`;
      cardEl.style.height = `${Math.max(14, ((curEnd - curStart) / 60) * HOUR_PX) - 1}px`;
    };

    // ── Top handle: adjust start time ────────────────────────────
    const onTopStart = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      topHandle.addEventListener("touchmove", onTopMove, { passive: false });
      topHandle.addEventListener("touchend",  onTopEnd);
      topHandle.addEventListener("touchcancel", onTopEnd);
    };
    const onTopMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const dayEl = cardEl.closest<HTMLElement>(".dl-day-body");
      if (!dayEl) return;
      const raw = snapMins(((ev.touches[0].clientY - dayEl.getBoundingClientRect().top) / HOUR_PX) * 60);
      curStart = Math.max(0, Math.min(curEnd - 15, raw));
      refreshCard(); updateBar();
    };
    const onTopEnd = () => {
      topHandle.removeEventListener("touchmove", onTopMove);
      topHandle.removeEventListener("touchend",  onTopEnd);
      topHandle.removeEventListener("touchcancel", onTopEnd);
    };
    topHandle.addEventListener("touchstart", onTopStart, { passive: false });

    // ── Bottom handle: adjust end time ───────────────────────────
    const onBottomStart = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      bottomHandle.addEventListener("touchmove", onBottomMove, { passive: false });
      bottomHandle.addEventListener("touchend",  onBottomEnd);
      bottomHandle.addEventListener("touchcancel", onBottomEnd);
    };
    const onBottomMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const dayEl = cardEl.closest<HTMLElement>(".dl-day-body");
      if (!dayEl) return;
      const raw = snapMins(((ev.touches[0].clientY - dayEl.getBoundingClientRect().top) / HOUR_PX) * 60);
      curEnd = Math.max(curStart + 15, Math.min(24 * 60, raw));
      refreshCard(); updateBar();
    };
    const onBottomEnd = () => {
      bottomHandle.removeEventListener("touchmove", onBottomMove);
      bottomHandle.removeEventListener("touchend",  onBottomEnd);
      bottomHandle.removeEventListener("touchcancel", onBottomEnd);
    };
    bottomHandle.addEventListener("touchstart", onBottomStart, { passive: false });

    // ── Card body: drag to move ───────────────────────────────────
    let isDragging = false;
    let dragOffsetMins = 0;
    let dragGhost: HTMLElement | null = null;
    const cardRect = cardEl.getBoundingClientRect();

    const onBodyStart = (ev: TouchEvent) => {
      if ((ev.target as HTMLElement).closest(".dl-edit-handle")) return;
      dragOffsetMins = Math.round(((ev.touches[0].clientY - cardRect.top) / HOUR_PX) * 60);
      isDragging = false;
      cardEl.addEventListener("touchmove", onBodyMove, { passive: false });
      cardEl.addEventListener("touchend",  onBodyEnd);
      cardEl.addEventListener("touchcancel", onBodyEnd);
    };
    const onBodyMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      if (!isDragging) {
        isDragging = true;
        dragGhost = document.body.createDiv("dl-drag-ghost");
        dragGhost.style.cssText = `display:block;width:${cardRect.width}px;height:${cardRect.height}px;left:${cardRect.left}px;top:${cardRect.top}px`;
        dragGhost.createDiv({ cls: "dl-event-title", text: event.title });
      }
      if (dragGhost) {
        dragGhost.style.left = `${t.clientX - cardRect.width / 2}px`;
        dragGhost.style.top  = `${t.clientY - (dragOffsetMins / 60) * HOUR_PX}px`;
      }
      const hit = this.findDayBodyAt(t.clientX, t.clientY);
      if (hit) {
        const raw = snapMins(((t.clientY - hit.el.getBoundingClientRect().top) / HOUR_PX) * 60 - dragOffsetMins);
        curStart = Math.max(0, Math.min(23 * 60, raw));
        curEnd   = curStart + (endMin - startMin);
        curDate  = hit.date;
        updateBar();
      }
    };
    const onBodyEnd = () => {
      cardEl.removeEventListener("touchmove", onBodyMove);
      cardEl.removeEventListener("touchend",  onBodyEnd);
      cardEl.removeEventListener("touchcancel", onBodyEnd);
      dragGhost?.remove(); dragGhost = null;
      if (!isDragging) return;
      isDragging = false;
    };
    cardEl.addEventListener("touchstart", onBodyStart, { passive: true });

    // Outside tap dismisses
    const commitAndClose = async () => {
      const changed = curStart !== startMin || curEnd !== endMin || curDate !== date;
      cleanup();
      if (!changed) return;
      try {
        const moveStartDate = curDate !== date ? curDate : startDate;
        const moveEndDate = curDate !== date ? curDate : endDate;
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(moveStartDate, curStart),
          minsToISO(moveEndDate, curEnd),
        );
      } catch (err: any) {
        new Notice(`Fehler: ${err?.message ?? err}`);
      }
    };

    const onOutside = (ev: TouchEvent) => {
      if (!cardEl.contains(ev.target as Node) && !barEl.contains(ev.target as Node))
        void commitAndClose();
    };
    setTimeout(() => document.addEventListener("touchstart", onOutside, { passive: true }), 0);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.mobileEdit = null;
      topHandle.removeEventListener("touchstart", onTopStart);
      topHandle.removeEventListener("touchmove", onTopMove);
      topHandle.removeEventListener("touchend",  onTopEnd);
      topHandle.removeEventListener("touchcancel", onTopEnd);
      bottomHandle.removeEventListener("touchstart", onBottomStart);
      bottomHandle.removeEventListener("touchmove", onBottomMove);
      bottomHandle.removeEventListener("touchend",  onBottomEnd);
      bottomHandle.removeEventListener("touchcancel", onBottomEnd);
      cardEl.removeEventListener("touchstart", onBodyStart);
      cardEl.removeEventListener("touchmove",  onBodyMove);
      cardEl.removeEventListener("touchend",   onBodyEnd);
      cardEl.removeEventListener("touchcancel", onBodyEnd);
      document.removeEventListener("touchstart", onOutside);
      dragGhost?.remove(); dragGhost = null;
      topHandle.remove();
      bottomHandle.remove();
      barEl.remove();
      cardEl.removeClass("dl-event-card--editing");
    };

    this.mobileEdit = { event, cleanup };
  }

  private exitMobileEditMode() {
    this.mobileEdit?.cleanup();
  }

  // ── Drag-to-create ───────────────────────────────────────────────

  private onDayMouseDown(e: MouseEvent, dayEl: HTMLElement, date: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".dl-event-card")) return;
    e.preventDefault();

    const rect = dayEl.getBoundingClientRect();
    const startMin = Math.max(
      0,
      Math.min(23 * 60, snapMins(((e.clientY - rect.top) / HOUR_PX) * 60)),
    );
    let endMin = Math.min(24 * 60, startMin + 30);

    const ghost = dayEl.createDiv("dl-ghost-event");
    this.refreshGhost(ghost, startMin, endMin);

    const onMove = (ev: MouseEvent) => {
      const rawMins = snapMins(
        ((ev.clientY - dayEl.getBoundingClientRect().top) / HOUR_PX) * 60,
      );
      endMin = Math.max(startMin + 15, Math.min(24 * 60, rawMins));
      this.refreshGhost(ghost, startMin, endMin);
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      ghost.remove();
      this.dragCreate = null;
      this.showCreatePopover(date, startMin, endMin, ev);
    };

    this.dragCreate = { ghost, onMove, onUp };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private refreshGhost(ghost: HTMLElement, startMin: number, endMin: number) {
    ghost.style.top = `${(startMin / 60) * HOUR_PX}px`;
    ghost.style.height = `${Math.max(14, ((endMin - startMin) / 60) * HOUR_PX)}px`;
    ghost.textContent = `${minsToTimeStr(startMin)} – ${minsToTimeStr(endMin)}`;
  }

  private cancelDrag() {
    if (this.dragCreate) {
      document.removeEventListener("mousemove", this.dragCreate.onMove);
      document.removeEventListener("mouseup", this.dragCreate.onUp);
      this.dragCreate.ghost.remove();
      this.dragCreate = null;
    }
    if (this.dragMove) {
      document.removeEventListener("mousemove", this.dragMove.onMove);
      document.removeEventListener("mouseup", this.dragMove.onUp);
      this.dragMove.ghost.remove();
      this.dragMove.landing.remove();
      this.dragMove = null;
    }
    if (this.dragResize) {
      document.removeEventListener("mousemove", this.dragResize.onMove);
      document.removeEventListener("mouseup", this.dragResize.onUp);
      this.dragResize = null;
    }
    document.body.style.userSelect = "";
  }

  private showCreatePopover(
    date: string,
    startMin: number,
    endMin: number,
    pos: { clientX: number; clientY: number },
  ) {
    document.querySelector(".dl-create-popover")?.remove();

    const popover = document.body.createDiv("dl-create-popover");
    const parseTime = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

    // Calendar
    const { discoveredCalendars, selectedCalendars } = this.plugin.settings.caldav;
    const activeCals = discoveredCalendars.filter(c => selectedCalendars.length === 0 || selectedCalendars.includes(c.href));
    let calName = activeCals[0]?.displayName ?? "";

    // Title
    const titleInput = popover.createEl("input", {
      type: "text", cls: "dl-create-input", placeholder: "Titel…",
    } as any) as HTMLInputElement;

    // Time row
    const timeRow = popover.createDiv("dl-create-time-row");
    const startInput = timeRow.createEl("input", { type: "time", cls: "dl-create-time-input" } as any) as HTMLInputElement;
    startInput.step = "60";
    startInput.value = minsToTimeStr(startMin);
    timeRow.createSpan({ cls: "dl-create-time-sep", text: "–" });
    const endInput = timeRow.createEl("input", { type: "time", cls: "dl-create-time-input" } as any) as HTMLInputElement;
    endInput.step = "60";
    endInput.value = minsToTimeStr(endMin);

    // Description
    const descInput = popover.createEl("textarea", {
      cls: "dl-create-desc", placeholder: "Beschreibung (optional)",
    } as any) as HTMLTextAreaElement;

    // Calendar chips (only when multiple calendars active)
    if (activeCals.length > 1) {
      const calRow = popover.createDiv("dl-create-cal-row");
      for (const c of activeCals) {
        const chip = calRow.createDiv("dl-create-cal-chip");
        if (c.displayName === calName) chip.addClass("dl-create-cal-chip--active");
        const dot = chip.createDiv("dl-create-cal-dot");
        dot.style.background = `hsl(${this.calendarHue(c.displayName)}, 65%, 52%)`;
        chip.createSpan({ text: c.displayName });
        chip.addEventListener("click", () => {
          calName = c.displayName;
          calRow.querySelectorAll(".dl-create-cal-chip--active").forEach(el => el.removeClass("dl-create-cal-chip--active"));
          chip.addClass("dl-create-cal-chip--active");
        });
      }
    }

    // Actions
    const actions = popover.createDiv("dl-create-actions");
    const cancelBtn = actions.createEl("button", { cls: "dl-create-btn", text: "Abbrechen" });
    const createBtn = actions.createEl("button", { cls: "dl-create-btn dl-create-btn--primary", text: "Erstellen" });

    const confirm = async () => {
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      const s = parseTime(startInput.value);
      const e = parseTime(endInput.value);
      if (e <= s) { endInput.style.borderColor = "var(--color-red)"; return; }
      popover.remove();
      cleanup();
      try {
        await this.plugin.calendarReader.createEvent({
          title,
          start: minsToISO(date, s),
          end: minsToISO(date, e),
          ...(calName ? { calendar: calName } : {}),
          ...(descInput.value.trim() ? { notes: descInput.value.trim() } : {}),
        });
      } catch (err: any) {
        new Notice(`Fehler beim Erstellen: ${err?.message ?? err}`);
      }
    };
    const cancel = () => { popover.remove(); cleanup(); };

    createBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    cancelBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    createBtn.addEventListener("click", confirm);
    cancelBtn.addEventListener("click", cancel);

    titleInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); confirm(); }
      if (ev.key === "Escape") cancel();
    });

    const onOutside = (ev: Event) => {
      if (!popover.contains(ev.target as Node)) { popover.remove(); cleanup(); }
    };
    const cleanup = () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("touchstart", onOutside);
    }, 0);

    // Positioning
    if (Platform.isMobile) {
      popover.addClass("dl-create-popover--mobile");
      popover.style.left = "50%";
      popover.style.transform = "translateX(-50%)";
      popover.style.top = "12%";
    } else {
      popover.style.left = `${pos.clientX + 12}px`;
      popover.style.top = `${pos.clientY - 24}px`;
    }
    setTimeout(() => {
      if (!Platform.isMobile) {
        const r = popover.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) popover.style.left = `${pos.clientX - r.width - 12}px`;
        if (r.bottom > window.innerHeight - 8) popover.style.top = `${window.innerHeight - r.height - 8}px`;
      }
      titleInput.focus();
    }, 0);
  }

  private showEventEditPopover(
    event: CalendarEvent,
    date: string,
    source: MouseEvent | TouchEvent,
    readOnly: boolean,
  ) {
    document.querySelector(".dl-create-popover")?.remove();
    this.hideHoverPopover();

    const popover = document.body.createDiv("dl-create-popover dl-edit-popover");
    const parseTime = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    const initialStart = new Date(event.start);
    const initialEnd = new Date(event.end);
    const startMin = initialStart.getHours() * 60 + initialStart.getMinutes();
    const endMin = initialEnd.getHours() * 60 + initialEnd.getMinutes();
    const startDate = toDateStr(initialStart);
    const endDate = toDateStr(initialEnd);
    const durationMin = Math.max(15, Math.round((initialEnd.getTime() - initialStart.getTime()) / 60000));

    const titleInput = popover.createEl("input", {
      type: "text",
      cls: "dl-create-input",
      placeholder: "Titel...",
    } as any) as HTMLInputElement;
    titleInput.value = event.title;
    titleInput.disabled = readOnly;

    const timeRow = popover.createDiv("dl-create-time-row");
    const startInput = timeRow.createEl("input", { type: "time", cls: "dl-create-time-input" } as any) as HTMLInputElement;
    startInput.step = "60";
    startInput.value = minsToTimeStr(startMin);
    startInput.disabled = readOnly;
    timeRow.createSpan({ cls: "dl-create-time-sep", text: "-" });
    const endInput = timeRow.createEl("input", { type: "time", cls: "dl-create-time-input" } as any) as HTMLInputElement;
    endInput.step = "60";
    endInput.value = minsToTimeStr(endMin);
    endInput.disabled = readOnly;
    const keepValidEndAfterStartChange = () => {
      if (readOnly) return;
      const s = parseTime(startInput.value);
      const e = parseTime(endInput.value);
      if (endInput.value && e > s) return;
      endInput.value = minsToTimeStr(Math.min(23 * 60 + 59, s + durationMin));
    };
    startInput.addEventListener("input", keepValidEndAfterStartChange);
    startInput.addEventListener("change", keepValidEndAfterStartChange);

    const locationInput = popover.createEl("input", {
      type: "text",
      cls: "dl-create-input",
      placeholder: "Ort",
    } as any) as HTMLInputElement;
    locationInput.value = event.location ?? "";
    locationInput.disabled = readOnly;

    const descInput = popover.createEl("textarea", {
      cls: "dl-create-desc",
      placeholder: "Beschreibung",
    } as any) as HTMLTextAreaElement;
    descInput.value = event.body ?? "";
    descInput.disabled = readOnly;

    const { discoveredCalendars, selectedCalendars } = this.plugin.settings.caldav;
    const activeCals = discoveredCalendars.filter(c => selectedCalendars.length === 0 || selectedCalendars.includes(c.href));
    let calendarValue = event.calendar ?? "";
    if (activeCals.length > 0) {
      const calRow = popover.createDiv("dl-create-cal-row");
      const knownCalendars = activeCals.some(c => c.displayName === calendarValue)
        ? activeCals
        : [{ href: "", displayName: calendarValue }, ...activeCals].filter(c => c.displayName);
      for (const c of knownCalendars) {
        const chip = calRow.createDiv("dl-create-cal-chip");
        if (c.displayName === calendarValue) chip.addClass("dl-create-cal-chip--active");
        const dot = chip.createDiv("dl-create-cal-dot");
        dot.style.background = `hsl(${this.calendarHue(c.displayName)}, 65%, 52%)`;
        chip.createSpan({ text: c.displayName });
        if (!readOnly) {
          chip.addEventListener("click", () => {
            calendarValue = c.displayName;
            calRow.querySelectorAll(".dl-create-cal-chip--active").forEach(el => el.removeClass("dl-create-cal-chip--active"));
            chip.addClass("dl-create-cal-chip--active");
          });
        }
      }
    } else {
      const calendarInput = popover.createEl("input", {
        type: "text",
        cls: "dl-create-input",
        placeholder: "Kalender",
      } as any) as HTMLInputElement;
      calendarInput.value = calendarValue;
      calendarInput.disabled = readOnly;
      calendarInput.addEventListener("input", () => { calendarValue = calendarInput.value.trim(); });
    }

    if (readOnly) {
      popover.createDiv({ cls: "setting-item-description", text: "Dieses Event ist in Deskleaf schreibgeschuetzt." });
    }

    const actions = popover.createDiv("dl-create-actions");
    const deleteBtn = readOnly ? null : actions.createEl("button", {
      cls: "dl-create-btn dl-create-btn--danger",
      text: event.isOrganizer === false ? "Ablehnen" : "Löschen",
    });
    const cancelBtn = actions.createEl("button", { cls: "dl-create-btn", text: readOnly ? "Schliessen" : "Abbrechen" });
    const saveBtn = readOnly ? null : actions.createEl("button", { cls: "dl-create-btn dl-create-btn--primary", text: "Speichern" });

    const clearErrors = () => {
      titleInput.style.borderColor = "";
      startInput.style.borderColor = "";
      endInput.style.borderColor = "";
    };
    const validate = (): EventUpdate | null => {
      clearErrors();
      const title = titleInput.value.trim();
      const s = parseTime(startInput.value);
      const e = parseTime(endInput.value);
      if (!title) { titleInput.style.borderColor = "var(--color-red)"; titleInput.focus(); return null; }
      if (!startInput.value) { startInput.style.borderColor = "var(--color-red)"; startInput.focus(); return null; }
      if (!endInput.value || e <= s) { endInput.style.borderColor = "var(--color-red)"; endInput.focus(); return null; }
      return {
        title,
        start: minsToISO(startDate, s),
        end: minsToISO(endDate, e),
        location: locationInput.value.trim(),
        notes: descInput.value.trim(),
        calendar: calendarValue,
      };
    };
    const close = () => { popover.remove(); cleanup(); };
    const save = async () => {
      const update = validate();
      if (!update) return;
      if (event.isRecurring) {
        const span = await this.askRecurringEditSpan();
        if (!span) return;
        update.span = span;
      }
      close();
      try {
        await this.plugin.calendarReader.updateEvent(event.id, update);
        const updatedEvent: CalendarEvent = {
          ...event,
          title: update.title,
          start: update.start,
          end: update.end,
          location: update.location ?? null,
          body: update.notes ?? null,
          calendar: update.calendar,
        };
        await this.plugin.noteManager.syncEventNote(event, updatedEvent);
      } catch (err: any) {
        new Notice(`Fehler beim Speichern: ${err?.message ?? err}`);
      }
    };

    cancelBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    cancelBtn.addEventListener("click", close);
    deleteBtn?.addEventListener("mousedown", (ev) => ev.preventDefault());
    deleteBtn?.addEventListener("click", async () => {
      const span = event.isRecurring ? await this.askRecurringEditSpan() : "this";
      if (!span) return;
      close();
      try {
        await this.plugin.calendarReader.cancelEvent(event.id, span === "series" ? "future" : "this");
      } catch (err: any) {
        new Notice(`Fehler: ${err?.message ?? err}`);
      }
    });
    saveBtn?.addEventListener("mousedown", (ev) => ev.preventDefault());
    saveBtn?.addEventListener("click", save);
    titleInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !readOnly) { ev.preventDefault(); save(); }
      if (ev.key === "Escape") close();
    });

    const onOutside = (ev: Event) => {
      if (!popover.contains(ev.target as Node)) close();
    };
    const cleanup = () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("touchstart", onOutside);
    }, 0);

    const pos = this.eventPosition(source);
    if (Platform.isMobile) {
      popover.addClass("dl-create-popover--mobile");
      popover.style.left = "50%";
      popover.style.transform = "translateX(-50%)";
      popover.style.top = "12%";
    } else {
      popover.style.left = `${pos.clientX + 12}px`;
      popover.style.top = `${pos.clientY - 24}px`;
      requestAnimationFrame(() => {
        const r = popover.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) popover.style.left = `${pos.clientX - r.width - 12}px`;
        if (r.bottom > window.innerHeight - 8) popover.style.top = `${window.innerHeight - r.height - 8}px`;
      });
    }
    titleInput.focus();
  }

  private eventPosition(source: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
    if ("touches" in source) {
      const touch = source.touches[0] ?? source.changedTouches[0];
      if (touch) return { clientX: touch.clientX, clientY: touch.clientY };
    }
    return {
      clientX: (source as MouseEvent).clientX ?? window.innerWidth / 2,
      clientY: (source as MouseEvent).clientY ?? window.innerHeight / 2,
    };
  }

  private askRecurringEditSpan(): Promise<"this" | "series" | null> {
    return new Promise((resolve) => {
      const modal = document.body.createDiv("dl-create-popover dl-edit-scope-popover");
      modal.createDiv({ cls: "dl-hover-title", text: "Wiederkehrenden Termin aendern" });
      modal.createDiv({ cls: "setting-item-description", text: "Soll nur dieser Termin oder die Serie geaendert werden?" });
      const actions = modal.createDiv("dl-create-actions");
      const cancel = actions.createEl("button", { cls: "dl-create-btn", text: "Abbrechen" });
      const one = actions.createEl("button", { cls: "dl-create-btn", text: "Nur dieser Termin" });
      const series = actions.createEl("button", { cls: "dl-create-btn dl-create-btn--primary", text: "Serie" });
      modal.style.left = "50%";
      modal.style.top = "18%";
      modal.style.transform = "translateX(-50%)";
      const finish = (span: "this" | "series" | null) => {
        modal.remove();
        resolve(span);
      };
      cancel.addEventListener("click", () => finish(null));
      one.addEventListener("click", () => finish("this"));
      series.addEventListener("click", () => finish("series"));
    });
  }

  private onDayTouchStart(e: TouchEvent, dayEl: HTMLElement, date: string) {
    if ((e.target as HTMLElement).closest(".dl-event-card, .dl-resize-handle, .dl-edit-handle")) return;

    const touch = e.touches[0];
    const rect = dayEl.getBoundingClientRect();
    const startMin = Math.max(0, Math.min(23 * 60, snapMins(((touch.clientY - rect.top) / HOUR_PX) * 60)));
    let endMin = Math.min(24 * 60, startMin + 30);
    const startX = touch.clientX;
    const startY = touch.clientY;
    let holdActive = false;
    let ghost: HTMLElement | null = null;

    const cleanup = () => {
      window.clearTimeout(timer);
      ghost?.remove();
      ghost = null;
      dayEl.removeEventListener("touchmove", onMove);
      dayEl.removeEventListener("touchend", onEnd);
      dayEl.removeEventListener("touchcancel", onEnd);
    };

    const timer = window.setTimeout(() => {
      holdActive = true;
      if ((navigator as any).vibrate) (navigator as any).vibrate(10);
      ghost = dayEl.createDiv("dl-ghost-event");
      this.refreshGhost(ghost, startMin, endMin);
    }, 350);

    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!holdActive) {
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cleanup();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const rawMins = snapMins(((t.clientY - dayEl.getBoundingClientRect().top) / HOUR_PX) * 60);
      endMin = Math.max(startMin + 15, Math.min(24 * 60, rawMins));
      if (ghost) this.refreshGhost(ghost, startMin, endMin);
    };

    const onEnd = (ev: TouchEvent) => {
      const wasActive = holdActive;
      const t = ev.changedTouches[0];
      cleanup();
      if (!wasActive) return;
      this.showCreatePopover(date, startMin, endMin, t);
    };

    dayEl.addEventListener("touchmove", onMove, { passive: false });
    dayEl.addEventListener("touchend", onEnd);
    dayEl.addEventListener("touchcancel", onEnd);
  }

  // ── Drag-to-move / Drag-to-resize ───────────────────────────────

  private findDayBodyAt(
    x: number,
    y: number,
  ): { el: HTMLElement; date: string } | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const h = el as HTMLElement;
      if (h.dataset?.date && h.classList.contains("dl-day-body"))
        return { el: h, date: h.dataset.date };
    }
    return null;
  }

  private onEventMoveMouseDown(
    e: MouseEvent,
    event: CalendarEvent,
    date: string,
    cardEl: HTMLElement,
    onDragStart: () => void,
  ) {
    const startX = e.clientX,
      startY = e.clientY;
    const cardRect = cardEl.getBoundingClientRect();
    const clickOffsetMins = Math.round(
      ((e.clientY - cardRect.top) / HOUR_PX) * 60,
    );
    const durationMins = Math.round(
      (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000,
    );

    const ghost = document.body.createDiv("dl-drag-ghost");
    ghost.style.cssText = `width:${cardRect.width}px;height:${cardRect.height}px;left:${cardRect.left}px;top:${cardRect.top}px;display:none`;
    ghost.createDiv({ cls: "dl-event-title", text: event.title });

    const landing = document.createElement("div");
    landing.className = "dl-landing-ghost";
    landing.style.height = `${Math.max(20, (durationMins / 60) * HOUR_PX)}px`;

    let dragging = false;
    let targetDate: string | null = null;
    let targetStartMins = 0;

    const onMove = (ev: MouseEvent) => {
      if (!dragging) {
        const dx = ev.clientX - startX,
          dy = ev.clientY - startY;
        if (dx * dx + dy * dy < 25) return;
        dragging = true;
        document.body.style.userSelect = "none";
        ghost.style.display = "block";
        onDragStart();
      }
      ghost.style.left = `${ev.clientX - cardRect.width / 2}px`;
      ghost.style.top = `${ev.clientY - (clickOffsetMins / 60) * HOUR_PX}px`;

      const hit = this.findDayBodyAt(ev.clientX, ev.clientY);
      if (hit) {
        const dayRect = hit.el.getBoundingClientRect();
        const rawMins =
          ((ev.clientY - dayRect.top) / HOUR_PX) * 60 - clickOffsetMins;
        targetStartMins = Math.max(0, Math.min(23 * 60, snapMins(rawMins)));
        targetDate = hit.date;
        landing.textContent = `${minsToTimeStr(targetStartMins)} – ${minsToTimeStr(Math.min(24 * 60, targetStartMins + durationMins))}`;
        landing.style.top = `${(targetStartMins / 60) * HOUR_PX}px`;
        if (landing.parentElement !== hit.el) hit.el.appendChild(landing);
      } else {
        landing.remove();
        targetDate = null;
      }
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      ghost.remove();
      landing.remove();
      this.dragMove = null;
      if (!dragging || !targetDate) return;

      const origDate = event.start.slice(0, 10);
      const origStartMins =
        new Date(event.start).getHours() * 60 +
        new Date(event.start).getMinutes();
      if (targetDate === origDate && targetStartMins === origStartMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(targetDate, targetStartMins),
          minsToISO(targetDate, targetStartMins + durationMins),
        );
      } catch (err: any) {
        new Notice(`Fehler beim Verschieben: ${err?.message ?? err}`);
      }
    };

    this.dragMove = { ghost, landing, onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private onResizeMouseDown(
    e: MouseEvent,
    event: CalendarEvent,
    date: string,
    cardEl: HTMLElement,
    edge: "start" | "end",
  ) {
    if (e.button !== 0) return;
    e.preventDefault();

    let startMins =
      new Date(event.start).getHours() * 60 +
      new Date(event.start).getMinutes();
    let endMins =
      new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
    const dayBody = cardEl.closest<HTMLElement>(".dl-day-body");
    const startDate = toDateStr(new Date(event.start));
    const endDate = toDateStr(new Date(event.end));
    const origTop = cardEl.offsetTop;
    const origH = cardEl.offsetHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dayBody) return;
      const dayRect = dayBody.getBoundingClientRect();
      const rawMins = ((ev.clientY - dayRect.top) / HOUR_PX) * 60;
      if (edge === "start") {
        startMins = Math.max(0, Math.min(endMins - 15, snapMins(rawMins)));
        cardEl.style.top = `${(startMins / 60) * HOUR_PX + 1}px`;
      } else {
        endMins = Math.max(startMins + 15, Math.min(24 * 60, snapMins(rawMins)));
      }
      const newH = Math.max(20, ((endMins - startMins) / 60) * HOUR_PX) - 2;
      cardEl.style.height = `${newH}px`;
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      cardEl.style.top = `${origTop}px`;
      cardEl.style.height = `${origH}px`;
      this.dragResize = null;

      const origStartMins =
        new Date(event.start).getHours() * 60 +
        new Date(event.start).getMinutes();
      const origEndMins =
        new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
      if (startMins === origStartMins && endMins === origEndMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(startDate, startMins),
          minsToISO(endDate, endMins),
        );
      } catch (err: any) {
        new Notice(`Fehler beim Ändern: ${err?.message ?? err}`);
      }
    };

    this.dragResize = { onMove, onUp };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Mobile "today" button ────────────────────────────────────────

  private buildMobileTodayFab(container: HTMLElement) {
    const today = new Date();
    // Only show when we're not already on today — keeps the grid clean otherwise
    const isToday = this.getColumnsForOffset(0).flatMap((c) => c.dates).includes(toDateStr(today));
    if (isToday) return;

    const fab = container.createDiv("dl-today-fab");
    fab.setAttribute("aria-label", "Zurück zu heute");
    fab.innerHTML = todayIconSvg(20);
    fab.addEventListener("click", () => {
      this.anchor = new Date();
      this.render();
    });
  }

  // ── Now-line tick ────────────────────────────────────────────────

  private tickNowLine() {
    const now = new Date();
    const topPx = (((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60) * HOUR_PX;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const root = this.containerEl.children[1] as HTMLElement;
    root.querySelectorAll<HTMLElement>(".dl-now-line").forEach(el => { el.style.top = `${topPx}px`; });
    root.querySelectorAll<HTMLElement>(".dl-now-label").forEach(el => {
      el.style.top = `${topPx}px`;
      el.textContent = timeStr;
    });
  }

  // ── Hover popover ────────────────────────────────────────────────

  private showHoverPopover(e: MouseEvent, event: CalendarEvent) {
    if (this.hoverTimer !== null) window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => {
      this.hoverTimer = null;
      this.hideHoverPopover();

      const el = document.body.createDiv("dl-hover-popover");
      this.hoverEl = el;

      el.createDiv({ cls: "dl-hover-title", text: event.title });

      const timeStr = event.isAllDay
        ? "Ganztägig"
        : `${toTimeStr(event.start)} – ${toTimeStr(event.end)}`;
      el.createDiv({ cls: "dl-hover-meta", text: timeStr });

      const isJitsi =
        event.meetingPlatform?.toLowerCase().includes("jitsi") ||
        event.location?.toLowerCase().includes("jitsi") ||
        event.location?.toLowerCase().includes("meet.jit.si");
      const isTeams =
        event.meetingPlatform?.toLowerCase().includes("teams") ||
        event.location?.toLowerCase().includes("teams");
      const isMeet =
        !isJitsi && (
          event.meetingPlatform?.toLowerCase().includes("meet") ||
          (event.location?.toLowerCase().includes("meet") && event.location?.toLowerCase().includes("google"))
        );

      if (isTeams) {
        const row = el.createDiv({ cls: "dl-hover-meta dl-hover-teams" });
        row.innerHTML = teamsIconSvg(14) + `<span style="margin-left:4px">Microsoft Teams</span>`;
      } else if (isMeet) {
        const row = el.createDiv({ cls: "dl-hover-meta dl-hover-meet" });
        row.innerHTML = meetIconSvg(14) + `<span style="margin-left:4px">Google Meet</span>`;
      } else if (isJitsi) {
        const row = el.createDiv({ cls: "dl-hover-meta dl-hover-jitsi" });
        row.innerHTML = jitsiIconSvg(14) + `<span style="margin-left:4px">Jitsi Meet</span>`;
      } else if (event.location) {
        const locEl = el.createDiv({ cls: "dl-hover-meta" });
        locEl.style.whiteSpace = "pre-line";
        locEl.textContent = event.location;
      }

      if (event.calendar)
        el.createDiv({ cls: "dl-hover-meta dl-hover-calendar", text: event.calendar });
      if ((event.numAttendees ?? 0) > 1)
        el.createDiv({ cls: "dl-hover-meta", text: `${event.numAttendees} Teilnehmer` });
      if (!isTeams && !isMeet && !isJitsi && event.meetingPlatform)
        el.createDiv({ cls: "dl-hover-meta", text: event.meetingPlatform });
      if (this.noteCache.has(event.id))
        el.createDiv({ cls: "dl-hover-meta dl-hover-note", text: "Notiz verknüpft" });

      el.style.left = `${e.clientX + 14}px`;
      el.style.top = `${e.clientY - 12}px`;

      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth - 8)
          el.style.left = `${e.clientX - r.width - 14}px`;
        if (r.bottom > window.innerHeight - 8)
          el.style.top = `${window.innerHeight - r.height - 8}px`;
      });
    }, 350);
  }

  private hideHoverPopover() {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.hoverEl) {
      this.hoverEl.remove();
      this.hoverEl = null;
    }
  }

  // ── Context menu ────────────────────────────────────────────────

  private showEventContextMenu(e: MouseEvent, event: CalendarEvent, date: string) {
    e.preventDefault();
    const menu = new Menu();
    const label = event.isOrganizer ? "Termin löschen" : "Einladung ablehnen";

    if (event.isRecurring) {
      menu.addItem((item) =>
        item
          .setTitle(`${label} (nur dieser Termin)`)
          .setIcon("x")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id, "this");
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle(`${label} (dieser und alle folgenden)`)
          .setIcon("x-circle")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id, "future");
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
    } else {
      menu.addItem((item) =>
        item
          .setTitle(label)
          .setIcon("x")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id);
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
    }

    menu.showAtMouseEvent(e);
  }

  // ── Note opening ────────────────────────────────────────────────

  private async openEvent(event: CalendarEvent, modifier = false) {
    this.applySelection(event);
    this.render();
    const { file, isNew } = await this.plugin.noteManager.openOrCreate(event);
    if (Platform.isMobile) modifier = false;
    await openFile(this.app, file, modifier);
    if (isNew)
      setTimeout(() => {
        const editor = this.app.workspace.getActiveViewOfType(MarkdownView)
          ?.editor as any;
        editor?.fold?.({ line: 0, ch: 0 });
      }, 100);
  }
}
