import { Itinerary, HotelRecommend } from "../types";
import { reconcileItineraryBudget } from "./budgetCalculator";

// Helper to load QR code or fall back
const loadImgUrlBase64 = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 1500); // safety timeout
    img.src = url;
  });
};

// Character-tracked text to simulate elegant editorial typography
const drawSpacedText = (doc: any, text: string, x: number, y: number, spacing: number, align: "left" | "center" = "left") => {
  const chars = text.split("");
  if (align === "center") {
    const totalW = chars.reduce((sum, char) => sum + doc.getTextWidth(char) + spacing, 0) - spacing;
    let curX = x - totalW / 2;
    chars.forEach((char) => {
      doc.text(char, curX, y);
      curX += doc.getTextWidth(char) + spacing;
    });
  } else {
    let curX = x;
    chars.forEach((char) => {
      doc.text(char, curX, y);
      curX += doc.getTextWidth(char) + spacing;
    });
  }
};

// Premium card with visual shadow and left colored bar
const drawPremiumCard = (doc: any, x: number, y: number, w: number, h: number, rx: number = 2, ry: number = 2, borderLeftColor?: number[], bgSelectedColor?: number[]) => {
  doc.setFillColor(243, 244, 246); // subtle shadow
  doc.roundedRect(x + 0.6, y + 0.6, w, h, rx, ry, "F");

  if (bgSelectedColor) {
    doc.setFillColor(bgSelectedColor[0], bgSelectedColor[1], bgSelectedColor[2]);
  } else {
    doc.setFillColor(255, 255, 255);
  }
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, rx, ry, "FD");

  if (borderLeftColor) {
    doc.setFillColor(borderLeftColor[0], borderLeftColor[1], borderLeftColor[2]);
    doc.rect(x, y, 1.5, h, "F");
  }
};

// Compass rose for premium cover visual
const drawCompassRose = (doc: any, cx: number, cy: number, r: number) => {
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, r, "D");
  doc.circle(cx, cy, r * 0.85, "D");
  doc.circle(cx, cy, r * 0.6, "D");

  doc.line(cx, cy - r, cx, cy + r);
  doc.line(cx - r, cy, cx + r, cy);

  doc.setFillColor(13, 148, 136);
  doc.triangle(cx, cy, cx - r * 0.15, cy - r * 0.3, cx, cy - r * 0.9, "F");
  doc.setFillColor(20, 184, 166);
  doc.triangle(cx, cy, cx + r * 0.15, cy - r * 0.3, cx, cy - r * 0.9, "F");

  doc.setFillColor(13, 148, 136);
  doc.triangle(cx, cy, cx - r * 0.15, cy + r * 0.3, cx, cy + r * 0.9, "F");
  doc.setFillColor(20, 184, 166);
  doc.triangle(cx, cy, cx + r * 0.15, cy + r * 0.3, cx, cy + r * 0.9, "F");

  doc.setFillColor(15, 23, 42);
  doc.circle(cx, cy, r * 0.2, "FD");
  doc.setFillColor(20, 184, 166);
  doc.circle(cx, cy, r * 0.08, "F");
};

// Math-based vector star drawer
const drawStar = (doc: any, cx: number, cy: number, r: number) => {
  const points: { x: number; y: number }[] = [];
  const spikes = 5;
  const outerRadius = r;
  const innerRadius = r * 0.4;
  let rot = Math.PI / 2 * 3;
  const step = Math.PI / spikes;

  for (let i = 0; i < spikes; i++) {
    let px = cx + Math.cos(rot) * outerRadius;
    let py = cy + Math.sin(rot) * outerRadius;
    points.push({ x: px, y: py });
    rot += step;

    px = cx + Math.cos(rot) * innerRadius;
    py = cy + Math.sin(rot) * innerRadius;
    points.push({ x: px, y: py });
    rot += step;
  }

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    doc.triangle(cx, cy, p1.x, p1.y, p2.x, p2.y, "F");
  }
};

// Vector icon drawer helpers
const drawClockIcon = (doc: any, x: number, y: number, color: number[] = [100, 116, 139]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  doc.circle(x, y, 1.8, "D");
  doc.line(x, y, x, y - 1);
  doc.line(x, y, x + 0.8, y + 0.3);
};

const drawMapPinIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.1);
  doc.circle(x, y - 0.5, 1.2, "F");
  doc.triangle(x - 1.2, y - 0.5, x + 1.2, y - 0.5, x, y + 1.5, "F");
  doc.setFillColor(255, 255, 255);
  doc.circle(x, y - 0.5, 0.4, "F");
};

const drawDollarIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.1);
  doc.circle(x, y, 1.8, "D");
  // Currency-neutral money icon: avoid a literal "$" appearing in INR/AED/EUR PDFs.
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.35);
  doc.line(x - 0.8, y - 0.45, x + 0.8, y - 0.45);
  doc.line(x - 0.8, y + 0.45, x + 0.8, y + 0.45);
};

const drawTransitIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  doc.line(x - 1.5, y, x + 1.5, y);
  doc.line(x + 0.5, y - 1, x + 1.5, y);
  doc.line(x + 0.5, y + 1, x + 1.5, y);
  doc.circle(x - 0.5, y, 0.6, "D");
};

const drawWarningIcon = (doc: any, x: number, y: number) => {
  doc.setFillColor(217, 119, 6);
  doc.setDrawColor(217, 119, 6);
  doc.triangle(x, y - 2, x - 2.2, y + 2, x + 2.2, y + 2, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 0.3, y - 1, 0.6, 1.6, "F");
  doc.circle(x, y + 1.2, 0.4, "F");
};

const drawCheckIcon = (doc: any, x: number, y: number) => {
  doc.setFillColor(13, 148, 136);
  doc.circle(x, y, 2.2, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.line(x - 1, y, x - 0.2, y + 0.8);
  doc.line(x - 0.2, y + 0.8, x + 1.2, y - 0.8);
};

const drawShieldIcon = (doc: any, x: number, y: number, color: number[] = [239, 68, 68]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.1);
  doc.triangle(x, y + 2, x - 1.8, y - 1, x + 1.8, y - 1, "F");
  doc.rect(x - 1.8, y - 2, 3.6, 1, "F");
  doc.setFillColor(255, 255, 255);
  doc.circle(x, y - 0.5, 0.5, "F");
};

const drawLightBulbIcon = (doc: any, x: number, y: number, color: number[] = [217, 119, 6]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.15);
  doc.circle(x, y - 0.6, 1.4, "F");
  doc.triangle(x - 0.8, y - 0.6, x + 0.8, y - 0.6, x, y + 1.6, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 0.8, y + 0.8, 1.6, 0.5, "F");
};

const drawWalkIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.35);
  // Head
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x, y - 1.2, 0.4, "F");
  // Body & Legs (vector path)
  doc.line(x, y - 0.8, x, y + 0.3);
  doc.line(x, y + 0.3, x - 0.6, y + 1.2); // leg 1
  doc.line(x, y + 0.3, x + 0.6, y + 1.2); // leg 2
  doc.line(x, y - 0.5, x - 0.7, y); // arm 1
  doc.line(x, y - 0.5, x + 0.7, y); // arm 2
  doc.setLineWidth(prevLineWidth);
};

const drawCabIcon = (doc: any, x: number, y: number, color: number[] = [217, 119, 6]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  // Cab frame
  doc.roundedRect(x - 1.6, y - 0.6, 3.2, 1.4, 0.3, 0.3, "D");
  doc.roundedRect(x - 1.0, y - 1.3, 2.0, 0.8, 0.2, 0.2, "D");
  // Taxi sign on top
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x - 0.4, y - 1.7, 0.8, 0.4, "F");
  // Wheels
  doc.circle(x - 0.9, y + 1.0, 0.45, "FD");
  doc.circle(x + 0.9, y + 1.0, 0.45, "FD");
  doc.setLineWidth(prevLineWidth);
};

const drawBusIcon = (doc: any, x: number, y: number, color: number[] = [2, 132, 199]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  // Main bus body
  doc.roundedRect(x - 1.5, y - 1.5, 3.0, 2.6, 0.4, 0.4, "D");
  // Windshield & lights
  doc.rect(x - 1.1, y - 1.1, 2.2, 0.9, "D");
  doc.circle(x - 0.9, y + 0.6, 0.3, "F");
  doc.circle(x + 0.9, y + 0.6, 0.3, "F");
  // Wheels
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x - 0.8, y + 1.3, 0.4, "F");
  doc.circle(x + 0.8, y + 1.3, 0.4, "F");
  doc.setLineWidth(prevLineWidth);
};

const drawCarIcon = (doc: any, x: number, y: number, color: number[] = [79, 70, 229]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  // Car body
  doc.roundedRect(x - 1.8, y - 0.5, 3.6, 1.3, 0.3, 0.3, "D");
  doc.roundedRect(x - 1.2, y - 1.1, 2.4, 0.7, 0.3, 0.3, "D");
  // Wheels
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x - 1.0, y + 1.0, 0.45, "F");
  doc.circle(x + 1.0, y + 1.0, 0.45, "F");
  doc.setLineWidth(prevLineWidth);
};

const drawMetroIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.35);
  // Metro front body
  doc.roundedRect(x - 1.4, y - 1.5, 2.8, 2.8, 0.5, 0.5, "D");
  // Window
  doc.rect(x - 1.0, y - 1.1, 2.0, 1.0, "D");
  // Lights
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x - 0.7, y + 0.8, 0.3, "F");
  doc.circle(x + 0.7, y + 0.8, 0.3, "F");
  // Rails underneath
  doc.line(x - 1.6, y + 1.6, x + 1.6, y + 1.6);
  doc.line(x - 0.9, y + 1.4, x - 1.1, y + 1.8);
  doc.line(x + 0.9, y + 1.4, x + 1.1, y + 1.8);
  doc.setLineWidth(prevLineWidth);
};

const drawWalletIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  const prevLineWidth = doc.getLineWidth();
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.35);
  // main wallet body
  doc.roundedRect(x - 2, y - 1.5, 4, 3, 0.5, 0.5, "D");
  // wallet flap
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x + 0.2, y - 0.6, 1.8, 1.2, 0.2, 0.2, "F");
  // clasp dot
  doc.setFillColor(255, 255, 255);
  doc.circle(x + 1.1, y, 0.25, "F");
  doc.setLineWidth(prevLineWidth);
};

const drawTransportIcon = (doc: any, x: number, y: number, mode: string, color: number[] = [13, 148, 136]) => {
  const m = mode.toLowerCase();
  if (m.includes("walk") || m.includes("foot") || m.includes("step")) {
    drawWalkIcon(doc, x, y, color);
  } else if (m.includes("cab") || m.includes("taxi") || m.includes("uber") || m.includes("grab") || m.includes("ola")) {
    drawCabIcon(doc, x, y, color);
  } else if (m.includes("bus")) {
    drawBusIcon(doc, x, y, color);
  } else if (m.includes("metro") || m.includes("train") || m.includes("subway") || m.includes("rail") || m.includes("tube")) {
    drawMetroIcon(doc, x, y, color);
  } else {
    // default to car
    drawCarIcon(doc, x, y, color);
  }
};

const drawPriceBadge = (doc: any, x: number, y: number, w: number, h: number, priceStr: string) => {
  const p = priceStr.toLowerCase();
  let badgeColor = [13, 148, 136]; // default teal (Paid)
  let badgeBg = [204, 251, 241]; // light teal
  let txtColor = [13, 148, 136];

  if (p.includes("free") || p === "0" || p.includes("no charge") || p.includes("included")) {
    badgeColor = [16, 185, 129]; // Green
    badgeBg = [209, 250, 229]; // light green
    txtColor = [16, 185, 129];
  } else if (p.includes("premium") || p.includes("luxury") || p.includes("high") || p.includes("12,000") || p.includes("15,000") || p.includes("18000") || parseVal(p) > 5000) {
    badgeColor = [245, 158, 11]; // Orange
    badgeBg = [254, 243, 199]; // light orange
    txtColor = [217, 119, 6];
  }

  drawPremiumCard(doc, x, y, w, h, 0.8, 0.8, badgeColor, badgeBg);
  
  doc.setFont("helvetica", "bold");
  let fs = 6.5;
  const chars = priceStr.length;
  const estimatedTextWidth = chars * 0.95; // mm
  const maxAvailableWidth = w - 4; // 4mm safety margin

  if (estimatedTextWidth > maxAvailableWidth) {
    fs = 6.5 * (maxAvailableWidth / estimatedTextWidth);
    if (fs < 4.5) {
      fs = 4.5;
    }
  }

  doc.setFontSize(fs);
  doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
  
  // Center the text vertically and horizontally
  const yOffset = h / 2 + (fs / 20) + 0.45;
  doc.text(priceStr, x + w / 2, y + yOffset, { align: "center" });
};

const drawCenteredBadge = (
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  borderColor: number[] | undefined,
  bgColor: number[],
  textColor: number[],
  iconType?: "clock" | "calendar" | "weather" | "map" | "hotel"
) => {
  // Draw the rounded card/box
  drawPremiumCard(doc, x, y, w, h, 0.8, 0.8, borderColor, bgColor);

  doc.setFont("helvetica", "bold");
  let fs = 6.5;
  
  const hasIcon = !!iconType;
  const iconSpace = hasIcon ? 4.5 : 0;
  const maxAvailableTextWidth = w - 4 - iconSpace;
  
  doc.setFontSize(fs);
  let actualTextWidth = doc.getTextWidth(text);
  if (actualTextWidth > maxAvailableTextWidth) {
    fs = fs * (maxAvailableTextWidth / actualTextWidth);
    if (fs < 4.5) {
      fs = 4.5;
    }
    doc.setFontSize(fs);
    actualTextWidth = doc.getTextWidth(text);
  }
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  // Compute total width of icon + text for horizontal centering inside the badge box
  const totalUnitWidth = iconSpace + actualTextWidth;
  const startUnitX = x + (w - totalUnitWidth) / 2;

  const centerY = y + h / 2;
  if (iconType) {
    const iconX = startUnitX + 1.5;
    const iconY = centerY;
    if (iconType === "clock") {
      drawClockIcon(doc, iconX, iconY, textColor);
    } else if (iconType === "calendar") {
      drawCalendarIcon(doc, iconX, iconY, textColor);
    } else if (iconType === "weather") {
      drawWeatherIcon(doc, iconX, iconY, textColor);
    } else if (iconType === "map") {
      drawMapPinIcon(doc, iconX, iconY, textColor);
    } else if (iconType === "hotel") {
      drawHotelIcon(doc, iconX, iconY, textColor);
    }
  }

  const textX = hasIcon ? (startUnitX + iconSpace) : (x + w / 2);
  const textY = centerY + (fs / 20) + 0.45;
  
  doc.text(text, textX, textY, { align: hasIcon ? "left" : "center" });
};

const drawFoodIcon = (doc: any, x: number, y: number, color: number[] = [217, 119, 6]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.25);
  doc.circle(x, y, 1.8, "D");
  doc.circle(x, y, 1.2, "D");
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x - 2.5, y - 1.5, 0.4, 3, "F");
  doc.rect(x + 2.1, y - 1.5, 0.4, 3, "F");
};

const drawUserIcon = (doc: any, x: number, y: number, color: number[] = [13, 148, 136]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.1);
  doc.circle(x, y - 0.8, 0.8, "F");
  doc.triangle(x - 1.2, y + 1.2, x + 1.2, y + 1.2, x, y, "F");
};

const drawTripBalancingLogo = (doc: any, cx: number, cy: number, darkTheme = false, sizeMultiplier = 1) => {
  const prevLineWidth = doc.getLineWidth();

  // Cyan brand colors matching official logo:
  // Bright Cyan: [0, 229, 255] (Hex #00e5ff)
  // Deep Cyan: [0, 184, 212] (Hex #00b8d4)
  const cyanBright = [0, 229, 255];
  const cyanDeep = [0, 184, 212];
  const hubDark = [8, 12, 20];

  const primaryColor = cyanBright;
  const secondaryColor = cyanDeep;

  const r = 4.2 * sizeMultiplier; // base radius 4.2mm

  // 1. Concentric Sonar Rings
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.18 * sizeMultiplier);
  doc.circle(cx, cy, r, "D"); // Outer ring
  doc.setLineWidth(0.14 * sizeMultiplier);
  doc.circle(cx, cy, r * 0.78, "D"); // Mid ring
  doc.setLineWidth(0.10 * sizeMultiplier);
  doc.circle(cx, cy, r * 0.56, "D"); // Inner ring

  // 2. Faceted 4-Pointed Compass Star
  const needleW = r * 0.22;

  // NORTH POINT
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.triangle(cx, cy - r * 0.95, cx - needleW, cy - r * 0.28, cx, cy, "F");
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.triangle(cx, cy - r * 0.95, cx + needleW, cy - r * 0.28, cx, cy, "F");

  // SOUTH POINT
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.triangle(cx, cy + r * 0.95, cx - needleW, cy + r * 0.28, cx, cy, "F");
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.triangle(cx, cy + r * 0.95, cx + needleW, cy + r * 0.28, cx, cy, "F");

  // EAST POINT
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.triangle(cx + r * 0.95, cy, cx + r * 0.28, cy - needleW, cx, cy, "F");
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.triangle(cx + r * 0.95, cy, cx + r * 0.28, cy + needleW, cx, cy, "F");

  // WEST POINT
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.triangle(cx - r * 0.95, cy, cx - r * 0.28, cy - needleW, cx, cy, "F");
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.triangle(cx - r * 0.95, cy, cx - r * 0.28, cy + needleW, cx, cy, "F");

  // 3. Central Hub Ring & Inner Dot
  doc.setFillColor(hubDark[0], hubDark[1], hubDark[2]);
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.22 * sizeMultiplier);
  doc.circle(cx, cy, r * 0.22, "FD");

  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.circle(cx, cy, r * 0.08, "F");

  // Restore style
  doc.setLineWidth(prevLineWidth);
};

const drawWeatherIcon = (doc: any, x: number, y: number, color: number[] = [2, 132, 199]) => {
  const prevLineWidth = doc.getLineWidth();

  // Sun
  doc.setFillColor(245, 158, 11); // Amber/orange for sun warmth
  doc.setDrawColor(245, 158, 11);
  doc.circle(x - 0.6, y - 0.5, 1.1, "F");
  
  // Cloud
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.1);
  doc.circle(x + 0.4, y + 0.5, 0.9, "F");
  doc.circle(x - 0.2, y + 0.5, 0.7, "F");
  doc.circle(x + 0.9, y + 0.5, 0.6, "F");
  doc.rect(x - 0.2, y + 0.2, 1.1, 0.9, "F");

  doc.setLineWidth(prevLineWidth);
};

const drawCalendarIcon = (doc: any, x: number, y: number, color: number[] = [79, 70, 229]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  doc.rect(x - 1.5, y - 1.5, 3.0, 3.0, "D");
  doc.line(x - 1.5, y - 0.5, x + 1.5, y - 0.5);
  doc.line(x - 0.8, y - 1.5, x - 0.8, y - 2.0);
  doc.line(x + 0.8, y - 1.5, x + 0.8, y - 2.0);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x - 0.6, y + 0.6, 0.4, "F");
  doc.circle(x + 0.6, y + 0.6, 0.4, "F");
};

const drawHotelIcon = (doc: any, x: number, y: number, color: number[] = [79, 70, 229]) => {
  const prevLineWidth = doc.getLineWidth();

  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  
  // Hotel building outline (drawn as a refined luxury tower block)
  doc.rect(x - 1.5, y - 2.0, 3.0, 4.0, "F");
  
  // Windows
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 0.9, y - 1.4, 0.6, 0.6, "F");
  doc.rect(x + 0.3, y - 1.4, 0.6, 0.6, "F");
  doc.rect(x - 0.9, y - 0.4, 0.6, 0.6, "F");
  doc.rect(x + 0.3, y - 0.4, 0.6, 0.6, "F");
  doc.rect(x - 0.9, y + 0.6, 0.6, 0.6, "F");
  doc.rect(x + 0.3, y + 0.6, 0.6, 0.6, "F");
  
  // Luxury triangular roof cap
  doc.setFillColor(color[0], color[1], color[2]);
  doc.triangle(x - 1.8, y - 2.0, x + 1.8, y - 2.0, x, y - 2.8, "F");

  doc.setLineWidth(prevLineWidth);
};

const getActivityPeriod = (timeStr: string): "morning" | "afternoon" | "evening" | "night" => {
  if (!timeStr) return "morning";
  const clean = timeStr.toLowerCase();
  if (clean.includes("night") || (clean.includes("pm") && (clean.includes("10:") || clean.includes("11:") || clean.includes("9:") || clean.includes("8:")))) {
    return "night";
  }
  if (clean.includes("evening") || (clean.includes("pm") && (clean.includes("5:") || clean.includes("6:") || clean.includes("7:")))) {
    return "evening";
  }
  if (clean.includes("afternoon") || clean.includes("pm") || clean.includes("12:") || clean.includes("1:") || clean.includes("2:") || clean.includes("3:") || clean.includes("4:")) {
    return "afternoon";
  }
  return "morning";
};

const drawPeriodIcon = (doc: any, x: number, y: number, period: "morning" | "afternoon" | "evening" | "night", color: number[] = [13, 148, 136]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.25);

  if (period === "morning") {
    // Rising sun
    doc.circle(x, y - 0.4, 1.1, "F");
    doc.line(x - 2, y + 0.8, x + 2, y + 0.8);
    doc.line(x, y - 2, x, y - 1.5);
    doc.line(x - 1.4, y - 1.4, x - 1, y - 1);
    doc.line(x + 1.4, y - 1.4, x + 1, y - 1);
  } else if (period === "afternoon") {
    // Full bright sun
    doc.circle(x, y, 1.4, "F");
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45 * Math.PI) / 180;
      doc.line(x + 1.8 * Math.cos(angle), y + 1.8 * Math.sin(angle), x + 2.5 * Math.cos(angle), y + 2.5 * Math.sin(angle));
    }
  } else if (period === "evening") {
    // Setting sun / sunset
    doc.circle(x, y - 0.6, 1.1, "D");
    doc.line(x - 2.2, y + 0.8, x + 2.2, y + 0.8);
    doc.line(x - 1.5, y + 0.2, x + 1.5, y + 0.2);
  } else {
    // Moon and star
    doc.circle(x - 0.4, y, 1.3, "F");
    doc.setFillColor(255, 255, 255);
    doc.circle(x + 0.2, y - 0.2, 1.3, "F");
    doc.setFillColor(color[0], color[1], color[2]);
    doc.triangle(x + 1.1, y - 1.3, x + 1.5, y - 1.3, x + 1.3, y - 1.8, "F");
    doc.triangle(x + 1.1, y - 1.6, x + 1.5, y - 1.6, x + 1.3, y - 1.1, "F");
  }
};

// Math-based donut chart slice polygon
const drawPieSector = (doc: any, cx: number, cy: number, r: number, startAngle: number, endAngle: number, color: number[]) => {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  const points: { x: number; y: number }[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / segments);
    const rad = (angle - 90) * Math.PI / 180;
    points.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    doc.triangle(cx, cy, p1.x, p1.y, p2.x, p2.y, "F");
  }
};

const drawFallbackQRCode = (doc: any, x: number, y: number, size: number) => {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, size, size, 1.5, 1.5, "FD");

  const drawFinder = (fx: number, fy: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(fx, fy, 4, 4, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(fx + 0.8, fy + 0.8, 2.4, 2.4, "F");
    doc.setFillColor(30, 41, 59);
    doc.rect(fx + 1.4, fy + 1.4, 1.2, 1.2, "F");
  };

  drawFinder(x + 1.5, y + 1.5);
  drawFinder(x + size - 5.5, y + 1.5);
  drawFinder(x + 1.5, y + size - 5.5);

  doc.setFillColor(30, 41, 59);
  doc.rect(x + 6.5, y + 2.5, 1.5, 0.8, "F");
  doc.rect(x + 9, y + 1.5, 0.8, 1.5, "F");
  doc.rect(x + size - 4.5, y + size - 4.5, 1.5, 1.5, "F");
  doc.rect(x + 6.5, y + 6.5, 2, 2, "F");
  doc.rect(x + size - 8.5, y + 6.5, 1.5, 3, "F");
  doc.rect(x + 1.5, y + 7.5, 3, 1, "F");
};

const drawMiniRouteMap = (doc: any, x: number, y: number, w: number, h: number, activities: any[]) => {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("ROUTE TIMELINE", x + 4, y + 4.5);

  if (!activities || activities.length === 0) return;

  const nodes = activities.length;
  const step = (w - 16) / (nodes - 1 || 1);
  // Render every activity dynamically. Shrink icons/labels as the stop count grows instead of dropping stops.
  const nodeRadius = nodes <= 5 ? 3.2 : nodes <= 7 ? 2.7 : 2.3;
  const labelMax = nodes <= 5 ? 10 : nodes <= 7 ? 8 : 6;
  const labelFont = nodes <= 5 ? 5.5 : nodes <= 7 ? 4.7 : 4.1;
  
  // Draw premium track: dashed teal connector line
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x + 8, y + 16, x + w - 8, y + 16);
  doc.setLineDashPattern([], 0); // reset

  for (let i = 0; i < nodes; i++) {
    const cx = x + 8 + (i * step);
    const cy = y + 16;

    // Draw solid teal outer circle and white background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, nodeRadius, "FD");

    // Draw distinct node icons: Hotel icon for 1st stop, MapPin for others
    if (i === 0) {
      drawHotelIcon(doc, cx, cy + 0.2, [13, 148, 136]);
    } else {
      drawMapPinIcon(doc, cx, cy + 0.2, [13, 148, 136]);
    }

    // Connectors with tiny transport icons between nodes
    if (i < nodes - 1) {
      const nextCx = x + 8 + ((i + 1) * step);
      const midX = (cx + nextCx) / 2;
      const transMode = String((activities[i + 1] as any)?.transportFromPrevious || (activities[i + 1] as any)?.transport || "Walk");
      
      // Draw tiny transport icon in the middle of the line segment
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.circle(midX, cy, 2.0, "FD");
      drawTransportIcon(doc, midX, cy, transMode, [100, 116, 139]);
    }

    // Stop Label
    const rawTitle = activities[i].title || "Stop";
    const label = rawTitle.length > labelMax + 2 ? rawTitle.substring(0, labelMax) + ".." : rawTitle;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelFont);
    doc.setTextColor(51, 65, 85);
    
    const isEven = i % 2 === 0;
    const textY = isEven ? cy - 4.8 : cy + 7.8;
    doc.text(label, cx, textY, { align: "center" });

    // Step number badge
    doc.setFillColor(15, 23, 42);
    doc.circle(cx + 2.2, cy - 2.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(3.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), cx + 2.2, cy - 1.8, { align: "center" });
  }
};

const drawComingSoonPlaceholder = (doc: any, x: number, y: number, w: number, h: number, type: "attraction" | "food" | "hotel" = "attraction") => {
  // 1. Subtle, clean background base
  let bgColor = [248, 250, 252]; // Soft slate
  let borderColor = [226, 232, 240];
  let textColor = [148, 163, 184];
  let iconColor = [148, 163, 184];

  if (type === "food") {
    bgColor = [255, 251, 243]; // Soft amber/warm cream
    borderColor = [254, 243, 199];
    textColor = [217, 119, 6];
    iconColor = [245, 158, 11];
  } else if (type === "attraction") {
    bgColor = [240, 253, 250]; // Soft teal cream
    borderColor = [204, 251, 241];
    textColor = [13, 148, 136];
    iconColor = [20, 184, 166];
  } else if (type === "hotel") {
    bgColor = [245, 243, 255]; // Soft indigo/purple
    borderColor = [233, 213, 255];
    textColor = [107, 33, 168];
    iconColor = [147, 51, 234];
  }

  // Draw background panel
  doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");

  // Draw delicate inset frame
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.12);
  doc.roundedRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 1.0, 1.0, "D");

  // Draw beautiful micro icon in center
  const cx = x + w / 2;
  const cy = y + h / 2 - 2;

  if (type === "food") {
    // Elegant dish plate with fork & spoon vector
    doc.setDrawColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.setLineWidth(0.25);
    doc.circle(cx, cy, 1.6, "D");
    doc.setFillColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.rect(cx - 2.3, cy - 1.2, 0.4, 2.4, "F"); // Fork
    doc.rect(cx + 1.9, cy - 1.2, 0.4, 2.4, "F"); // Spoon
  } else if (type === "hotel") {
    // Elegant hotel/building outline
    doc.setFillColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.setDrawColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.setLineWidth(0.2);
    // Base & wall
    doc.rect(cx - 2.5, cy + 1.8, 5, 0.4, "F");
    doc.roundedRect(cx - 1.8, cy - 1.8, 3.6, 3.6, 0.4, 0.4, "D");
    // Windows
    doc.rect(cx - 0.8, cy - 1.0, 0.6, 0.6, "F");
    doc.rect(cx + 0.2, cy - 1.0, 0.6, 0.6, "F");
    doc.rect(cx - 0.8, cy + 0.2, 0.6, 0.6, "F");
    doc.rect(cx + 0.2, cy + 0.2, 0.6, 0.6, "F");
  } else {
    // Attraction / Landscape: Mountains & Sun outline
    doc.setFillColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.setDrawColor(iconColor[0], iconColor[1], iconColor[2]);
    doc.setLineWidth(0.2);
    doc.triangle(cx - 2.8, cy + 1.8, cx + 1.2, cy + 1.8, cx - 0.8, cy - 0.8, "D");
    doc.triangle(cx - 0.4, cy + 1.8, cx + 2.8, cy + 1.8, cx + 1.2, cy + 0.2, "D");
    doc.circle(cx + 1.8, cy - 1.0, 0.7, "FD");
  }

  // Draw letter-spaced "COMING SOON" text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  drawSpacedText(doc, "CURATED PICK", cx, y + h - 3.2, 0.35, "center");
};

const drawAttractionThumbnail = (doc: any, x: number, y: number, w: number, h: number, name: string) => {
  drawComingSoonPlaceholder(doc, x, y, w, h, "attraction");
};

// Smart Packing category detector
const getPackingCategory = (item: string): string => {
  const l = item.toLowerCase();
  if (l.includes("shirt") || l.includes("pant") || l.includes("shoe") || l.includes("jacket") || l.includes("sock") || l.includes("underwear") || l.includes("towel") || l.includes("clothes") || l.includes("dress") || l.includes("swimwear") || l.includes("hat") || l.includes("coat") || l.includes("jeans") || l.includes("shorts")) {
    return "Clothing";
  }
  if (l.includes("phone") || l.includes("charger") || l.includes("camera") || l.includes("adapter") || l.includes("laptop") || l.includes("cable") || l.includes("power bank") || l.includes("electronics") || l.includes("plug") || l.includes("earbuds") || l.includes("headphones") || l.includes("kindle")) {
    return "Electronics";
  }
  if (l.includes("passport") || l.includes("visa") || l.includes("ticket") || l.includes("id") || l.includes("insurance") || l.includes("booking") || l.includes("license") || l.includes("wallet") || l.includes("cash") || l.includes("documents") || l.includes("credit card") || l.includes("itinerary")) {
    return "Documents";
  }
  if (l.includes("med") || l.includes("pill") || l.includes("kit") || l.includes("bandage") || l.includes("prescription") || l.includes("sunscreen") || l.includes("hygiene") || l.includes("health") || l.includes("toiletries") || l.includes("brush") || l.includes("soap") || l.includes("sanitizer") || l.includes("paste")) {
    return "Health";
  }
  return "Miscellaneous";
};

// Numeric parser for spending calculations
const parseVal = (str: any): number => {
  if (!str) return 0;
  // Remove commas to handle formatted numbers like 1,50,000
  const noCommas = String(str).replace(/,/g, "");
  // Find the first occurrence of a number (integer or decimal)
  const match = noCommas.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
};

const estimateFoodPriceRange = (
  food: any,
  itemIndex: number,
  itinerary: Itinerary,
  currencySym: string
): string => {
  // Ignore AI-supplied price strings here. They may use destination-local currency
  // or an unrealistic numeric scale. The reconciled trip food budget below is authoritative.

  const days = Math.max(1, itinerary.days?.length || 1);
  const travelers = Math.max(1, itinerary.travelers || 1);
  const foodTotal =
    parseVal(itinerary.estimatedBudgetBreakdown?.food) ||
    parseVal(itinerary.detailedBudgetSummary?.foodTotal) ||
    0;

  const style = String(itinerary.travelStyle || "mid-range").toLowerCase();
  const perPersonDaily = foodTotal > 0
    ? foodTotal / days / travelers
    : style.includes("luxury") || style.includes("premium")
      ? 12000
      : style.includes("budget")
        ? 1800
        : 5000;
  const baseMeal = Math.max(1, perPersonDaily / 3);

  const text = `${food?.name || ""} ${food?.description || ""} ${food?.mustTryAt || ""}`.toLowerCase();
  let lowFactor = 0.55;
  let highFactor = 1.05;

  if (/michelin|ritz|ducasse|fine dining|gastronomic|truffle|tasting menu|luxury|premium/.test(text)) {
    lowFactor = 1.15;
    highFactor = 2.25;
  } else if (/street|croissant|pastry|bakery|boulangerie|crepe|sandwich|snack|macaron/.test(text)) {
    lowFactor = 0.18;
    highFactor = 0.48;
  } else if (/dessert|coffee|tea|beverage|soup/.test(text)) {
    lowFactor = 0.30;
    highFactor = 0.70;
  }

  const variation = 1 + ((itemIndex % 3) - 1) * 0.08;
  const roundNice = (value: number) => {
    const step = value >= 5000 ? 500 : value >= 1000 ? 100 : value >= 200 ? 10 : value >= 50 ? 5 : 1;
    return Math.max(step, Math.round(value / step) * step);
  };

  const low = roundNice(baseMeal * lowFactor * variation);
  const high = Math.max(low, roundNice(baseMeal * highFactor * variation));
  return `${currencySym}${low.toLocaleString()} - ${currencySym}${high.toLocaleString()}`;
};


// Prevent Truncation: Restrict location names and landmarks to a maximum of 40 characters
const sanitizeLocation = (loc: string): string => {
  if (!loc) return "";
  let clean = loc.trim();
  if (clean.length > 40) {
    const parts = clean.split(",");
    if (parts.length > 1) {
      const firstPart = parts[0].trim();
      // Keep real named venues compact (e.g. "Fisherman's Wharf, Cavelossim"),
      // but do not collapse descriptive fallback locations to meaningless text such
      // as "A licensed" or "A traditional".
      if (firstPart.length <= 40 && !/^(a|an|the)\s+(licensed|traditional|well[- ]reviewed|local|busy|reputable|upscale|premium)\b/i.test(firstPart)) {
        return firstPart;
      }
    }
    return clean.substring(0, 37) + "...";
  }
  return clean;
};

// Deep clone and recursively replace raw Rupee symbol with "Rs. " to prevent font rendering breaks
const sanitizeItineraryText = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    let cleaned = obj.replace(/₹/g, "Rs. ");
    cleaned = cleaned.replace(/Rs\.\s*Rs\./g, "Rs. ");
    // jsPDF's built-in Helvetica is not a full Unicode font. Transliterate
    // characters it cannot reliably encode so PDF text never becomes mojibake.
    const specialMap: Record<string, string> = { "ə": "e", "Ə": "E", "ı": "i", "İ": "I", "ş": "s", "Ş": "S", "ğ": "g", "Ğ": "G" };
    cleaned = cleaned.replace(/[əƏıİşŞğĞ]/g, (ch) => specialMap[ch] || ch);
    cleaned = cleaned.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return cleaned;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeItineraryText);
  }
  if (typeof obj === "object") {
    const res: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        res[key] = sanitizeItineraryText(obj[key]);
      }
    }
    return res;
  }
  return obj;
};

// Robust Mathematical Validation and Proportionate Scaling Engine
const optimizeItineraryForPDF = (rawItinerary: Itinerary, currencySym: string): Itinerary => {
  // PDF formatting must never run a second budget engine. Reconcile a clone with
  // the same global calculator used by the website, then only format that result.
  const cloned = JSON.parse(JSON.stringify(rawItinerary));
  const itinerary = sanitizeItineraryText(reconcileItineraryBudget(cloned));

  // Read the already-reconciled categories. Do not independently rescale them.
  const b = itinerary.estimatedBudgetBreakdown || ({} as any);
  const d = itinerary.detailedBudgetSummary || ({} as any);
  const hasOrigin = Boolean(itinerary.origin && itinerary.origin.trim() !== "");

  const acc = parseVal(b.accommodation) || parseVal(d.accommodationTotal) || 0;
  const food = parseVal(b.food) || parseVal(d.foodTotal) || 0;
  const activitiesBudget = parseVal(b.activities) || parseVal(d.attractionTotal) || 0;
  const localTransport = parseVal(b.transport) || parseVal(d.localTransportTotal) || 0;
  const flight = hasOrigin ? (parseVal(b.originToDestinationTravel) || parseVal(d.originToDestinationCost) || 0) : 0;
  const visaInsurance = parseVal((b as any).visaAndInsurance) || parseVal((d as any).visaAndInsurance) || 0;
  let miscellaneous = parseVal(b.miscellaneous) || parseVal(d.miscellaneousExpenses) || 0;

  const explicitTotal = parseVal(b.total) || parseVal(d.grandTotal) || parseVal((itinerary as any).realisticEstimatedCost);
  const visibleSubtotal = acc + food + activitiesBudget + localTransport + flight + visaInsurance + miscellaneous;
  const calculatedTotal = explicitTotal > 0 ? explicitTotal : visibleSubtotal;
  const fmt = (value: number) => `${currencySym}${Math.round(value).toLocaleString()}`;

  // reconcileItineraryBudget guarantees category sum == realistic total. If an
  // old saved itinerary is malformed, prefer the visible category sum rather
  // than silently moving a discrepancy into Miscellaneous inside the PDF.
  const pdfGrandTotal = visibleSubtotal > 0 ? visibleSubtotal : calculatedTotal;
  itinerary.realisticEstimatedCost = fmt(pdfGrandTotal);
  if (itinerary.estimatedBudgetBreakdown) itinerary.estimatedBudgetBreakdown.total = fmt(pdfGrandTotal);
  if (itinerary.detailedBudgetSummary) itinerary.detailedBudgetSummary.grandTotal = fmt(pdfGrandTotal);

  // 3. Constrain location and hotel names to max 40 chars
  if (itinerary.placesToVisit) {
    itinerary.placesToVisit.forEach((place: any) => {
      place.name = sanitizeLocation(place.name);
    });
  }

  if (itinerary.hotelRecommendations) {
    const r = itinerary.hotelRecommendations;
    if (r.budget) r.budget.forEach((h: any) => h.name = sanitizeLocation(h.name));
    if (r.midRange) r.midRange.forEach((h: any) => h.name = sanitizeLocation(h.name));
    if (r.luxury) r.luxury.forEach((h: any) => h.name = sanitizeLocation(h.name));
  }

  // 4. Preserve itinerary activity estimates and label the daily figure as a
  // realistic requirement. Never shrink real activity costs to fit the user's
  // planned budget.
  const daysData = itinerary.days || [];
  const totalDays = daysData.length || 1;

  // Build genuine day-specific destination spend. Flight/intercity travel and
  // travel protection remain trip-level summary costs instead of being dumped into Day 1.
  const activitySubtotals = daysData.map((day: any) => {
    const activities = Array.isArray(day.activities) ? day.activities : [];
    return activities.reduce((sum: number, act: any) => sum + parseVal(act.cost), 0);
  });
  const allActivitySubtotal = activitySubtotals.reduce((sum: number, value: number) => sum + value, 0);
  const destinationSpendTotal = acc + food + localTransport + activitiesBudget + miscellaneous;
  const sharedDaily = totalDays > 0 ? (acc + food + localTransport + miscellaneous) / totalDays : 0;
  let allocatedSoFar = 0;

  daysData.forEach((day: any, dayIndex: number) => {
    const activities = Array.isArray(day.activities) ? day.activities : [];
    activities.forEach((act: any) => {
      if (act.location) act.location = sanitizeLocation(act.location);
      act.title = sanitizeLocation(act.title);
      const costVal = parseVal(act.cost);
      if (costVal > 0) act.cost = currencySym + costVal.toLocaleString();
      else if (!act.cost || String(act.cost).trim() === "") act.cost = "Free / Included";
    });

    const activitySubtotal = activitySubtotals[dayIndex];
    const parts = (day as any).dailyCostBreakdown;
    const exactBreakdownTotal = parts
      ? parseVal(parts.accommodation) + parseVal(parts.food) + parseVal(parts.localTransport) + parseVal(parts.activities) + parseVal(parts.miscellaneous)
      : 0;

    let allocatedDayTotal: number;
    if (parts && exactBreakdownTotal >= 0) {
      // The visible five-part daily breakdown is authoritative. The displayed
      // daily total MUST be exactly the sum of those five visible rows.
      allocatedDayTotal = Math.round(exactBreakdownTotal);
    } else {
      const allocatedActivities = allActivitySubtotal > 0
        ? (activitiesBudget * activitySubtotal / allActivitySubtotal)
        : (totalDays > 0 ? activitiesBudget / totalDays : 0);
      const rawDayTotal = sharedDaily + allocatedActivities;
      const isLastDay = dayIndex === daysData.length - 1;
      allocatedDayTotal = destinationSpendTotal > 0
        ? (isLastDay ? Math.max(0, destinationSpendTotal - allocatedSoFar) : Math.round(rawDayTotal))
        : Math.round(rawDayTotal || activitySubtotal);
    }

    allocatedSoFar += allocatedDayTotal;
    day.dailyBudget = currencySym + allocatedDayTotal.toLocaleString();
    day.estimatedTotalSpend = currencySym + allocatedDayTotal.toLocaleString();
    day.activitySubtotal = currencySym + activitySubtotal.toLocaleString();
  });

  const plannedBudgetValue = parseVal((itinerary as any).plannedBudget || itinerary.budgetAmount);
  const shortfall = Math.max(0, pdfGrandTotal - plannedBudgetValue);
  (itinerary as any).budgetShortfall = fmt(shortfall);

  return itinerary;
};

// EXPORT MAIN ROUTINE
export const exportPremiumTravelPDF = async (
  rawItinerary: Itinerary,
  packingChecks: Record<string, boolean>,
  headerWeather: any[]
) => {
  const currencySym = (() => {
    // Planned budget is the authoritative display currency. Fall back to budgetAmount
    // only for older saved itineraries.
    const totalText = String((rawItinerary as any).plannedBudget || rawItinerary.budgetAmount || "");
    const lower = totalText.toLowerCase();
    if (totalText.includes("₹") || lower.includes("inr") || /\brs\.?\s*/i.test(totalText)) return "Rs. ";
    if (lower.includes("aed") || totalText.includes("د.إ")) return "AED ";
    if (totalText.includes("€") || lower.includes("eur")) return "€";
    if (totalText.includes("£") || lower.includes("gbp")) return "£";
    if (totalText.includes("¥") || lower.includes("jpy")) return "¥";
    if (totalText.includes("$") || lower.includes("usd")) return "$";
    return "Rs. ";
  })();

  const itinerary = optimizeItineraryForPDF(rawItinerary, currencySym);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const marginX = 15;
  let y = 15;

  // Track sections for post-processing header
  const pageSectionNames: Record<number, string> = {};
  const sectionStartPages: Record<number, boolean> = {};
  let currentSectionName = "";

  const checkPageEnd = (neededHeight: number) => {
    if (y + neededHeight > 262) {
      doc.addPage();
      y = 25;
      pageSectionNames[doc.getNumberOfPages()] = currentSectionName;
    }
  };

  const startSectionPage = (sectionNum: string, titleStr: string, subtitleStr: string) => {
    doc.addPage();
    const pageNum = doc.getNumberOfPages();
    sectionStartPages[pageNum] = true;
    currentSectionName = `SECTION ${sectionNum}: ${titleStr}`;
    pageSectionNames[pageNum] = currentSectionName;
    
    doc.setFillColor(15, 23, 42); // slate-900 cover block
    doc.rect(0, 0, 210, 52, "F");

    doc.setFillColor(13, 148, 136); // teal accent line
    doc.rect(0, 50, 210, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(20, 184, 166);
    drawSpacedText(doc, `SECTION ${sectionNum}`, marginX, 18, 0.2, "left");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(titleStr.toUpperCase(), marginX, 29);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(subtitleStr, marginX, 39);

    y = 64; // luxurious spacing below cover block
  };

  const drawHotelVectorFallback = (doc: any, x: number, y: number, w: number, h: number, name: string) => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");

    doc.setFillColor(203, 213, 225);
    doc.rect(x + 5, y + h - 2, 28, -10, "F");
    doc.setFillColor(148, 163, 184);
    doc.rect(x + 10, y + h - 2, 18, -12, "F");
    
    doc.setFillColor(255, 255, 255);
    doc.rect(x + 12, y + h - 6, 2, 2, "F");
    doc.rect(x + 16, y + h - 6, 2, 2, "F");
    doc.rect(x + 20, y + h - 6, 2, 2, "F");
    doc.rect(x + 12, y + h - 11, 2, 2, "F");
    doc.rect(x + 16, y + h - 11, 2, 2, "F");
    doc.rect(x + 20, y + h - 11, 2, 2, "F");

    doc.setFillColor(251, 191, 36);
    doc.circle(x + w - 4, y + 4, 1.2, "F");
  };

  // Helper to get direct Unsplash photo URLs supporting anonymous CORS
  const getDirectUnsplashUrl = (name: string, type: "landscape" | "attraction" | "food" | "hotel"): string => {
    const norm = name.toLowerCase().trim();
    
    if (type === "landscape") {
      if (norm.includes("paris") || norm.includes("france") || norm.includes("french")) {
        return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("london") || norm.includes("uk") || norm.includes("united kingdom") || norm.includes("england") || norm.includes("britain") || norm.includes("scotland") || norm.includes("edinburgh")) {
        return "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("tokyo") || norm.includes("japan") || norm.includes("kyoto") || norm.includes("osaka") || norm.includes("fuji") || norm.includes("hokkaido")) {
        return "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("new york") || norm.includes("nyc") || norm.includes("manhattan") || norm.includes("usa") || norm.includes("united states") || norm.includes("america") || norm.includes("brooklyn") || norm.includes("california") || norm.includes("los angeles") || norm.includes("san francisco")) {
        return "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("rome") || norm.includes("italy") || norm.includes("venice") || norm.includes("florence") || norm.includes("milan") || norm.includes("tuscany") || norm.includes("amalfi") || norm.includes("italian")) {
        return "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("bali") || norm.includes("indonesia") || norm.includes("ubud") || norm.includes("jakarta")) {
        return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("sydney") || norm.includes("australia") || norm.includes("melbourne") || norm.includes("queensland")) {
        return "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("dubai") || norm.includes("uae") || norm.includes("abu dhabi")) {
        return "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("switzerland") || norm.includes("alps") || norm.includes("zurich") || norm.includes("geneva") || norm.includes("lucerne") || norm.includes("swiss")) {
        return "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("maldives")) {
        return "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("singapore")) {
        return "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("thailand") || norm.includes("bangkok") || norm.includes("phuket") || norm.includes("pattaya") || norm.includes("chiang mai")) {
        return "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("egypt") || norm.includes("cairo") || norm.includes("pyramids") || norm.includes("giza") || norm.includes("nile")) {
        return "https://images.unsplash.com/photo-1503177119275-0aa32b31d468?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("greece") || norm.includes("athens") || norm.includes("santorini") || norm.includes("mykonos")) {
        return "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("turkey") || norm.includes("istanbul") || norm.includes("cappadocia") || norm.includes("antalya") || norm.includes("turkish")) {
        return "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("spain") || norm.includes("barcelona") || norm.includes("madrid") || norm.includes("seville") || norm.includes("mallorca") || norm.includes("ibiza") || norm.includes("spanish")) {
        return "https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("canada") || norm.includes("toronto") || norm.includes("vancouver") || norm.includes("montreal") || norm.includes("quebec")) {
        return "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("germany") || norm.includes("berlin") || norm.includes("munich") || norm.includes("frankfurt") || norm.includes("bavaria") || norm.includes("german")) {
        return "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("amsterdam") || norm.includes("netherlands") || norm.includes("holland") || norm.includes("dutch")) {
        return "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      // Destination-specific India covers must be checked BEFORE the generic India fallback.
      // Goa previously fell through to the generic India/Taj Mahal image, which produced a wrong-city cover.
      if (norm.includes("goa") || norm.includes("panaji") || norm.includes("panjim") || norm.includes("calangute") || norm.includes("baga") || norm.includes("anjuna") || norm.includes("vagator") || norm.includes("palolem")) {
        // Neutral tropical-coast image: destination-appropriate for Goa and never a false landmark claim.
        return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("uttar pradesh") || norm.includes("india") || norm.includes("agra") || norm.includes("taj") || norm.includes("delhi") || norm.includes("mumbai") || norm.includes("jaipur") || norm.includes("kerala") || norm.includes("bengaluru") || norm.includes("rajasthan") || norm.includes("varanasi")) {
        if (norm.includes("varanasi") || norm.includes("ghat") || norm.includes("ganges") || norm.includes("ganga")) {
          return "https://images.unsplash.com/photo-1561361531-99f2a6a9715e?auto=format&fit=crop&w=1200&h=1600&q=80";
        }
        if (norm.includes("jaipur") || norm.includes("rajasthan") || norm.includes("hawa mahal") || norm.includes("amer") || norm.includes("palace") || norm.includes("fort")) {
          return "https://images.unsplash.com/photo-1477587458883-471a5bd93ae3?auto=format&fit=crop&w=1200&h=1600&q=80";
        }
        if (norm.includes("delhi") || norm.includes("qutub") || norm.includes("india gate") || norm.includes("red fort")) {
          return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&h=1600&q=80";
        }
        if (norm.includes("mumbai") || norm.includes("bombay") || norm.includes("gateway")) {
          return "https://images.unsplash.com/photo-1529253355930-dd14234bc98e?auto=format&fit=crop&w=1200&h=1600&q=80";
        }
        if (norm.includes("kerala") || norm.includes("munnar") || norm.includes("backwaters")) {
          return "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=1200&h=1600&q=80";
        }
        return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("beach") || norm.includes("sea") || norm.includes("island") || norm.includes("ocean") || norm.includes("hawaii") || norm.includes("honolulu") || norm.includes("maui")) {
        return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      if (norm.includes("mountain") || norm.includes("himalaya") || norm.includes("trek") || norm.includes("nepal") || norm.includes("ladakh") || norm.includes("manali") || norm.includes("shimla") || norm.includes("nature") || norm.includes("forest") || norm.includes("lake") || norm.includes("hill")) {
        return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&h=1600&q=80";
      }
      // Unknown destination: do not show a potentially incorrect city/landmark.
      // Returning an empty URL lets the PDF render the branded neutral cover background.
      return "";
    }

    if (type === "attraction") {
      if (norm.includes("taj mahal") || norm.includes("taj") || norm.includes("agra")) {
        return "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("hawa mahal") || norm.includes("wind palace") || norm.includes("hawa")) {
        return "https://images.unsplash.com/photo-1603258474238-d1a2dd6d5b03?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("amer") || norm.includes("amber") || norm.includes("jaipur palace") || norm.includes("city palace")) {
        return "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("varanasi") || norm.includes("ghat") || norm.includes("ganges") || norm.includes("ganga") || norm.includes("aarti") || norm.includes("sarnath")) {
        return "https://images.unsplash.com/photo-1561361531-99f2a6a9715e?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("qutub minar") || norm.includes("qutub") || norm.includes("qutab")) {
        return "https://images.unsplash.com/photo-1585135497273-1a86b09fe70e?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("red fort") || norm.includes("lal qila") || norm.includes("fatehpur sikri") || norm.includes("agra fort")) {
        return "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("india gate") || norm.includes("gateway of india") || norm.includes("monument") || norm.includes("statue") || norm.includes("square") || norm.includes("plaza") || norm.includes("ruins") || norm.includes("ancient") || norm.includes("archaeological")) {
        return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("lotus temple") || norm.includes("lotus")) {
        return "https://images.unsplash.com/photo-1565352632231-43d18776615b?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("temple") || norm.includes("mandir") || norm.includes("spiritual") || norm.includes("puja") || norm.includes("wat") || norm.includes("pagoda") || norm.includes("kyoto") || norm.includes("shrine") || norm.includes("sensoji")) {
        return "https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("church") || norm.includes("cathedral") || norm.includes("mosque") || norm.includes("basilica") || norm.includes("notre dame") || norm.includes("duomo") || norm.includes("chapel") || norm.includes("synagogue")) {
        return "https://images.unsplash.com/photo-1548625361-155deee223d2?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("castle") || norm.includes("palace") || norm.includes("fort") || norm.includes("chateau") || norm.includes("versailles") || norm.includes("mahal") || norm.includes("royal")) {
        return "https://images.unsplash.com/photo-1508849789987-4e5333c12b78?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("lake") || norm.includes("pichola") || norm.includes("boating") || norm.includes("river") || norm.includes("pond") || norm.includes("canal") || norm.includes("waterfall") || norm.includes("falls") || norm.includes("stream") || norm.includes("fountain") || norm.includes("pool")) {
        return "https://images.unsplash.com/photo-1582972236019-ea4af5caf531?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("beach") || norm.includes("sea") || norm.includes("coastal") || norm.includes("ocean") || norm.includes("sand") || norm.includes("beachfront") || norm.includes("bay") || norm.includes("cliff") || norm.includes("shore") || norm.includes("island") || norm.includes("port") || norm.includes("harbor") || norm.includes("bondi")) {
        return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("market") || norm.includes("bazaar") || norm.includes("shopping") || norm.includes("mall") || norm.includes("street") || norm.includes("shop") || norm.includes("store") || norm.includes("souk")) {
        return "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("museum") || norm.includes("art") || norm.includes("gallery") || norm.includes("history") || norm.includes("exhibition") || norm.includes("louvre")) {
        return "https://images.unsplash.com/photo-1566121318534-7d89613665a8?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("park") || norm.includes("garden") || norm.includes("nature") || norm.includes("forest") || norm.includes("wildlife") || norm.includes("zoo") || norm.includes("greenery") || norm.includes("central park") || norm.includes("botanical")) {
        return "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("cafe") || norm.includes("restaurant") || norm.includes("bar") || norm.includes("pub") || norm.includes("food court") || norm.includes("theatre") || norm.includes("opera") || norm.includes("cinema") || norm.includes("concert") || norm.includes("show") || norm.includes("broadway")) {
        return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("tower") || norm.includes("skyline") || norm.includes("eiffel") || norm.includes("empire state") || norm.includes("burj khalifa") || norm.includes("shanghai") || norm.includes("skyscraper") || norm.includes("observatory") || norm.includes("viewpoint") || norm.includes("opera house")) {
        return "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("bridge") || norm.includes("golden gate") || norm.includes("london bridge") || norm.includes("brooklyn") || norm.includes("viaduct") || norm.includes("harbour bridge")) {
        return "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("mountain") || norm.includes("peak") || norm.includes("alps") || norm.includes("himalaya") || norm.includes("volcano") || norm.includes("fuji") || norm.includes("rock") || norm.includes("canyon") || norm.includes("trek") || norm.includes("hiking")) {
        return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&h=400&q=80";
      }
      const attractions = [
        "https://images.unsplash.com/photo-1554907914-1b72b9c313ee?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1566121318534-7d89613665a8?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&h=400&q=80"
      ];
      let sum = 0;
      for (let i = 0; i < norm.length; i++) sum += norm.charCodeAt(i);
      return attractions[sum % attractions.length];
    }

    if (type === "food") {
      if (norm.includes("pasta") || norm.includes("pizza") || norm.includes("spaghetti") || norm.includes("lasagna") || norm.includes("ravioli") || norm.includes("italian") || norm.includes("risotto") || norm.includes("macaroni") || norm.includes("bolognese") || norm.includes("pesto")) {
        return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("sushi") || norm.includes("ramen") || norm.includes("tempura") || norm.includes("japanese") || norm.includes("sashimi") || norm.includes("udon") || norm.includes("miso")) {
        return "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("burger") || norm.includes("fries") || norm.includes("american") || norm.includes("cheeseburger") || norm.includes("fastfood") || norm.includes("sandwich") || norm.includes("fast food")) {
        return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("taco") || norm.includes("burrito") || norm.includes("mexican") || norm.includes("nachos") || norm.includes("quesadilla") || norm.includes("fajita") || norm.includes("guacamole") || norm.includes("salsa")) {
        return "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("croissant") || norm.includes("pastry") || norm.includes("bakery") || norm.includes("french") || norm.includes("bread") || norm.includes("bagel") || norm.includes("donut") || norm.includes("muffin") || norm.includes("bun")) {
        return "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("steak") || norm.includes("beef") || norm.includes("meat") || norm.includes("grill") || norm.includes("bbq") || norm.includes("pork") || norm.includes("lamb") || norm.includes("ribs") || norm.includes("kabab") || norm.includes("tandoori") || norm.includes("tikka") || norm.includes("chicken") || norm.includes("kebab") || norm.includes("mutton")) {
        return "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("curry") || norm.includes("paneer") || norm.includes("masala") || norm.includes("thali") || norm.includes("indian") || norm.includes("makhani") || norm.includes("korma") || norm.includes("dal") || norm.includes("gravy") || norm.includes("naan") || norm.includes("roti") || norm.includes("subji") || norm.includes("biryani") || norm.includes("pulao") || norm.includes("rice") || norm.includes("jeera rice")) {
        return "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("chaat") || norm.includes("samosa") || norm.includes("street food") || norm.includes("snack") || norm.includes("kachori") || norm.includes("panipuri") || norm.includes("golgappa") || norm.includes("aloo tikki") || norm.includes("bhel") || norm.includes("sev")) {
        return "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("sweet") || norm.includes("dessert") || norm.includes("jalebi") || norm.includes("gulab") || norm.includes("cake") || norm.includes("halwa") || norm.includes("rasgulla") || norm.includes("kheer") || norm.includes("kulfi") || norm.includes("waffle") || norm.includes("chocolate") || norm.includes("ice cream") || norm.includes("pancake") || norm.includes("crepe") || norm.includes("pudding") || norm.includes("cookie") || norm.includes("brownie")) {
        return "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("tea") || norm.includes("chai") || norm.includes("coffee") || norm.includes("cafe") || norm.includes("beverage") || norm.includes("lassi") || norm.includes("drink") || norm.includes("shake") || norm.includes("latte") || norm.includes("espresso") || norm.includes("cappuccino") || norm.includes("macchiato")) {
        return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("dosa") || norm.includes("idli") || norm.includes("sambar") || norm.includes("south indian") || norm.includes("vada") || norm.includes("uttapam")) {
        return "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("salad") || norm.includes("vegan") || norm.includes("healthy") || norm.includes("vegetable") || norm.includes("avocado") || norm.includes("wrap")) {
        return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("seafood") || norm.includes("fish") || norm.includes("lobster") || norm.includes("shrimp") || norm.includes("crab") || norm.includes("oyster") || norm.includes("salmon") || norm.includes("tuna")) {
        return "https://images.unsplash.com/photo-1534080564583-6be75777b70a?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("noodle") || norm.includes("pad thai") || norm.includes("asian") || norm.includes("dim sum") || norm.includes("dumpling") || norm.includes("chow mein") || norm.includes("stir fry")) {
        return "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("soup") || norm.includes("stew") || norm.includes("broth") || norm.includes("pho")) {
        return "https://images.unsplash.com/photo-1547592165-e1d17fed6005?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("cocktail") || norm.includes("wine") || norm.includes("beer") || norm.includes("juice") || norm.includes("smoothie")) {
        return "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&h=400&q=80";
      }
      const foods = [
        "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&h=400&q=80"
      ];
      let sum = 0;
      for (let i = 0; i < norm.length; i++) sum += norm.charCodeAt(i);
      return foods[sum % foods.length];
    }

    if (type === "hotel") {
      if (norm.includes("luxury") || norm.includes("resort") || norm.includes("palace") || norm.includes("five star") || norm.includes("villa") || norm.includes("royal plaza") || norm.includes("palms luxury") || norm.includes("radisson") || norm.includes("taj hotel") || norm.includes("marriott") || norm.includes("oberoi") || norm.includes("spa") || norm.includes("retreat") || norm.includes("grand") || norm.includes("ritz")) {
        return "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("hostel") || norm.includes("backpack") || norm.includes("dorm") || norm.includes("comfort inn") || norm.includes("zostel") || norm.includes("gostops") || norm.includes("bed & breakfast") || norm.includes("guesthouse") || norm.includes("lodging")) {
        return "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("cabin") || norm.includes("lodge") || norm.includes("cottage") || norm.includes("wood") || norm.includes("nature") || norm.includes("chalet") || norm.includes("forest")) {
        return "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("modern") || norm.includes("stay") || norm.includes("apartment") || norm.includes("airbnb") || norm.includes("suites") || norm.includes("boutique") || norm.includes("plaza") || norm.includes("sheraton") || norm.includes("hilton") || norm.includes("hyatt") || norm.includes("hotel") || norm.includes("guest") || norm.includes("homestay") || norm.includes("residency") || norm.includes("house")) {
        return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&h=400&q=80";
      }
      if (norm.includes("budget") || norm.includes("comfort") || norm.includes("motel") || norm.includes("inn") || norm.includes("stay")) {
        return "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&h=400&q=80";
      }
      const hotels = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=600&h=400&q=80",
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&h=400&q=80"
      ];
      let sum = 0;
      for (let i = 0; i < norm.length; i++) sum += norm.charCodeAt(i);
      return hotels[sum % hotels.length];
    }

    return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&h=400&q=80";
  };

  // Preload only cover hero image
  const heroImageB64 = await loadImgUrlBase64(getDirectUnsplashUrl(itinerary.destination || "travel", "landscape"));

  const getAttractionImg = (name: string) => null;
  const getFoodImg = (name: string) => null;
  const getHotelImg = (name: string) => null;

  // ==========================================
  // PAGE 1: COVER PAGE (Luxury Magazine Style)
  // ==========================================
  if (heroImageB64) {
    try {
      doc.addImage(heroImageB64, "JPEG", 0, 0, 210, 297);
    } catch (e) {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 297, "F");
    }
  } else {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, "F");
  }

  // Draw semi-transparent dark overlay for luxury look and readability
  try {
    doc.saveGraphicsState();
    const gState = new (doc as any).GState({ opacity: 0.65 });
    doc.setGState(gState);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, "F");
    doc.restoreGraphicsState();
  } catch (e) {
    // fallback
  }

  // Cover Page Borders & Accents
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 190, 277, "D"); // Symmetrical border

  // Logo on Cover
  drawTripBalancingLogo(doc, 105, 31, true, 4.0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  drawSpacedText(doc, "TRIPBALANCING", 105, 60, 0.45, "center");

  // Tagline below logo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 184, 166);
  drawSpacedText(doc, "TRAVEL SMARTER. SPEND BETTER. EXPLORE MORE", 105, 68, 0.22, "center");

  // Huge Destination name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(31);
  doc.setTextColor(255, 255, 255);
  const destLines = doc.splitTextToSize(String(itinerary.destination || "").toUpperCase(), 170);
  doc.text(destLines, 105, 99, { align: "center" });

  // Dynamically calculate heights to prevent overlapping on long destination titles!
  const destLineHeight = 12.5;
  const destHeight = destLines.length * destLineHeight;
  const dividerY = 99 + destHeight - 4;

  // Luxury Divider Line below destination
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.8);
  doc.line(75, dividerY, 135, dividerY);

  // Sub-tagline
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  const styleKey = String(itinerary.travelStyle || "").toLowerCase();
  const coverTagline = styleKey.includes("budget") || styleKey.includes("backpack")
    ? "A personalized value-focused travel guide built around your budget"
    : styleKey.includes("luxury")
      ? "A bespoke luxury guide compiled for the discerning explorer"
      : `A personalized ${itinerary.travelStyle || "travel"} guide crafted for your journey`;
  doc.text(coverTagline, 105, dividerY + 9, { align: "center" });

  // Grid / Badges for Cover
  const coverTodayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const coverBadges = [
    { label: (itinerary as any).isAiBudgetPlanner ? "AI RECOMMENDED BUDGET" : "PLANNED BUDGET", val: String((itinerary as any).plannedBudget || itinerary.budgetAmount || "Bespoke"), color: [13, 148, 136] },
    { label: "REALISTIC ESTIMATE", val: String((itinerary as any).realisticEstimatedCost || itinerary.estimatedBudgetBreakdown?.total || "Calculating"), color: [2, 132, 199] },
    { label: "TRIP DURATION", val: `${itinerary.days?.length || 0} Days`, color: [79, 70, 229] },
    { label: "TOTAL TRAVELERS", val: `${itinerary.travelers} Pax`, color: [217, 119, 6] },
    { label: "TRAVEL STYLE", val: String(itinerary.travelStyle || "Premium").toUpperCase(), color: [20, 184, 166] },
    { label: "GENERATION DATE", val: coverTodayStr.toUpperCase(), color: [225, 29, 72] },
    itinerary.origin
      ? { label: "TRAVELING FROM", val: String(itinerary.origin).toUpperCase(), color: [147, 51, 234] }
      : { label: "VERSION CONTROL", val: "V1.0 PLATINUM", color: [100, 116, 139] },
    ...(itinerary.originToDestinationDuration && itinerary.originToDestinationDuration !== "N/A"
      ? [{ label: "TRAVEL TRANSIT TIME", val: String(itinerary.originToDestinationDuration).toUpperCase(), color: [236, 72, 153] }]
      : [])
  ];

  // Final cover layout: 3 + 3 + 2 large information cards, matching the approved reference.
  // Keep the cards comfortably above the footer while using the page width well.
  coverBadges.slice(0, 8).forEach((badge, idx) => {
    const rowIdx = idx < 3 ? 0 : idx < 6 ? 1 : 2;
    const colIdx = idx < 3 ? idx : idx < 6 ? idx - 3 : idx - 6;
    const cardW = 58;
    const cardH = 24;
    const gapX = 5;
    const rowWidths = [3 * cardW + 2 * gapX, 3 * cardW + 2 * gapX, 2 * cardW + gapX];
    const rowStartX = (210 - rowWidths[rowIdx]) / 2;
    const xPos = rowStartX + colIdx * (cardW + gapX);
    const yPos = 160 + rowIdx * 30;

    try {
      doc.saveGraphicsState();
      const gState = new (doc as any).GState({ opacity: 0.42 });
      doc.setGState(gState);
      doc.setFillColor(15, 23, 42);
      doc.rect(xPos, yPos, cardW, cardH, "F");
      doc.restoreGraphicsState();
    } catch (e) {
      doc.setFillColor(30, 41, 59);
      doc.rect(xPos, yPos, cardW, cardH, "F");
    }

    doc.setDrawColor(20, 184, 166);
    doc.setLineWidth(0.4);
    doc.rect(xPos, yPos, cardW, cardH, "D");

    doc.setFillColor(badge.color[0], badge.color[1], badge.color[2]);
    doc.rect(xPos, yPos, 2.5, cardH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(203, 213, 225);
    doc.text(badge.label, xPos + 6, yPos + 7.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const wrapVal = doc.splitTextToSize(badge.val, cardW - 11);
    doc.text(wrapVal, xPos + 6, yPos + 16);
  });

  // Footer text on cover — keep it below the information cards so it never overlaps them.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(148, 163, 184);
  doc.text(`TRIPBALANCING  •  PERSONALIZED TRAVEL GUIDE  •  GENERATED ${coverTodayStr.toUpperCase()}`, 105, 258, { align: "center" });
  doc.setFontSize(6.8);
  doc.text(`© ${new Date().getFullYear()} TripBalancing`, 105, 264, { align: "center" });

  // ==========================================
  // PAGE 2: TRIP SUMMARY & STATISTICS
  // ==========================================
  startSectionPage("01", "TRIP SUMMARY & LOGISTICS ATLAS", "A comprehensive high-level dashboard and logistics atlas of your upcoming travel.");

  const glanceCards = [
    { label: (itinerary as any).isAiBudgetPlanner ? "AI RECOMMENDED" : "PLANNED", value: (itinerary as any).plannedBudget || itinerary.budgetAmount || "N/A", bg: [240, 253, 250], txt: [13, 148, 136] },
    { label: "EST. COST", value: (itinerary as any).realisticEstimatedCost || itinerary.estimatedBudgetBreakdown?.total || "N/A", bg: [240, 249, 255], txt: [2, 132, 199] },
    { label: "DURATION", value: `${itinerary.days?.length || 0} Days`, bg: [240, 249, 255], txt: [2, 132, 199] },
    ...(itinerary.origin && itinerary.originToDestinationDuration && itinerary.originToDestinationDuration !== "N/A"
      ? [{ label: "TRANSIT TIME", value: itinerary.originToDestinationDuration, bg: [250, 245, 255], txt: [147, 51, 234] }]
      : []),
    { label: "DISTANCE", value: (itinerary as any).originToDestinationDistanceKm ? `${Number((itinerary as any).originToDestinationDistanceKm).toLocaleString()} km` : "N/A", bg: [238, 242, 255], txt: [79, 70, 229] },
    { label: "ATTRACTIONS", value: `${itinerary.placesToVisit?.length || 0} Places`, bg: [254, 243, 199], txt: [217, 119, 6] },
    { label: "TRAVELERS", value: `${itinerary.travelers} Pax`, bg: [255, 241, 242], txt: [225, 29, 72] }
  ];

  const gCardW = glanceCards.length > 5 ? 27 : 32;
  const spacing = glanceCards.length > 5 ? 3 : 4;
  glanceCards.forEach((card, idx) => {
    // Symmetrical centering for A4 (210mm width)
    const startX = (210 - (glanceCards.length * gCardW + (glanceCards.length - 1) * spacing)) / 2;
    const cardX = startX + (idx * (gCardW + spacing));
    drawPremiumCard(doc, cardX, y, gCardW, 18, 2, 2, card.txt, card.bg);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(glanceCards.length > 5 ? 5.5 : 6);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cardX + 3, y + 5.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(glanceCards.length > 5 ? 7.5 : 8.5);
    doc.setTextColor(card.txt[0], card.txt[1], card.txt[2]);
    // Truncate text or wrap if needed
    const wrapVal = doc.splitTextToSize(card.value, gCardW - 5);
    doc.text(wrapVal, cardX + 3, y + 12);

    // Render precise premium top-right icons inside each statistic card
    if (card.label === "BUDGET") drawDollarIcon(doc, cardX + gCardW - 5, y + 4.5, card.txt);
    else if (card.label === "DURATION") drawClockIcon(doc, cardX + gCardW - 5, y + 4.5, card.txt);
    else if (card.label === "TRANSIT TIME") drawClockIcon(doc, cardX + gCardW - 5, y + 4.5, card.txt);
    else if (card.label === "DISTANCE") drawMapPinIcon(doc, cardX + gCardW - 5, y + 5.2, card.txt);
    else if (card.label === "ATTRACTIONS") drawLightBulbIcon(doc, cardX + gCardW - 5, y + 5.2, card.txt);
    else if (card.label === "TRAVELERS") drawUserIcon(doc, cardX + gCardW - 5, y + 5, card.txt);
  });
  y += 26;

  // Curated lodging summary block
  drawPremiumCard(doc, marginX, y, 180, 26, 2, 2, [79, 70, 229]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("LODGING & ACCOMMODATION OVERVIEW", marginX + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const overviewHasAgodaRates = [itinerary.hotelRecommendations?.budget, itinerary.hotelRecommendations?.midRange, itinerary.hotelRecommendations?.luxury].some((list: any) => Array.isArray(list) && list.some((h: any) => h?.source === "agoda"));
  const hotelSummaryText = overviewHasAgodaRates
    ? `For your stay in ${itinerary.destination || "destination"}, TripBalancing found live Agoda hotel options for your selected dates. Section 04 shows current Agoda nightly rates, property ratings and booking links. Availability, taxes and cancellation terms can still change until booking is completed.`
    : `For your stay in ${itinerary.destination || "destination"}, we have compiled a premium index of options. Our recommended prime choices range from highly rated Budget selections up to ultra-luxury resort villas. For booking links and estimated nightly rate guidance, consult Section 04 of this guide. Rates are planning estimates, not live availability or guaranteed booking prices.`;
  doc.text(doc.splitTextToSize(hotelSummaryText, 170), marginX + 5, y + 11.5);
  y += 34;

  // Emergency & Phrase Card split
  const halfW = 87;
  drawPremiumCard(doc, marginX, y, halfW, 38, 2, 2, [239, 68, 68], [254, 242, 242]);
  
  doc.setFillColor(239, 68, 68);
  doc.circle(marginX + 6, y + 6, 2.5, "F");
  // Crisp white vector exclamation mark
  doc.setFillColor(255, 255, 255);
  doc.rect(marginX + 5.7, y + 4.5, 0.6, 2, "F");
  doc.circle(marginX + 6, y + 7.2, 0.4, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27);
  doc.text("EMERGENCY PHONE DIRECTORY", marginX + 11, y + 7.5);

  doc.setDrawColor(252, 165, 165);
  doc.setLineWidth(0.25);
  doc.line(marginX + 5, y + 11, marginX + halfW - 5, y + 11);

  const destinationText = String(itinerary.destination || "").toLowerCase();
  const emergencyDirectory = (() => {
    if (/france|paris|lyon|nice|marseille/.test(destinationText)) return { general: "112", police: "17", medical: "15" };
    if (/india|mumbai|delhi|goa|jaipur|bengaluru|bangalore|chennai|kolkata|hyderabad/.test(destinationText)) return { general: "112", police: "112 / 100", medical: "112 / 108" };
    if (/united kingdom|england|scotland|wales|london|manchester|edinburgh/.test(destinationText)) return { general: "999 / 112", police: "999 / 112", medical: "999 / 112" };
    if (/united states|usa|new york|los angeles|san francisco|chicago/.test(destinationText)) return { general: "911", police: "911", medical: "911" };
    if (/japan|tokyo|osaka|kyoto/.test(destinationText)) return { general: "110 / 119", police: "110", medical: "119" };
    if (/uae|united arab emirates|dubai|abu dhabi/.test(destinationText)) return { general: "999 / 998", police: "999", medical: "998" };
    if (/azerbaijan|baku/.test(destinationText)) return { general: "112", police: "102", medical: "103" };
    if (/indonesia|bali|jakarta/.test(destinationText)) return { general: "112", police: "110", medical: "118 / 119" };
    if (/australia|sydney|melbourne|brisbane/.test(destinationText)) return { general: "000", police: "000", medical: "000" };
    // Do not invent country-specific numbers when the app does not have a verified mapping.
    return { general: "Verify locally before travel", police: "Verify locally before travel", medical: "Verify locally before travel" };
  })();
  const entries = [
    { name: "• Emergency Helpline:", value: emergencyDirectory.general },
    { name: "• Local Police Desk:", value: emergencyDirectory.police },
    { name: "• Medical Emergency:", value: emergencyDirectory.medical }
  ];
  entries.forEach((e, idx) => {
    const ey = y + 16 + (idx * 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28);
    doc.text(e.name, marginX + 5, ey);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(127, 29, 29);
    doc.text(e.value, marginX + 44, ey);
  });

  const rightColX = marginX + halfW + 6;
  drawPremiumCard(doc, rightColX, y, halfW, 38, 2, 2, [13, 148, 136], [240, 253, 250]);

  doc.setFillColor(13, 148, 136);
  doc.circle(rightColX + 6, y + 6, 2.5, "F");
  // Crisp white vector chat bubble
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(rightColX + 4.8, y + 4.5, 2.4, 1.8, 0.4, 0.4, "F");
  doc.triangle(rightColX + 4.8, y + 5.5, rightColX + 5.4, y + 5.5, rightColX + 4.4, y + 6.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(13, 148, 136);
  doc.text("CURATED USEFUL LOCAL PHRASES", rightColX + 11, y + 7.5);

  doc.setDrawColor(153, 246, 228);
  doc.setLineWidth(0.25);
  doc.line(rightColX + 5, y + 11, rightColX + halfW - 5, y + 11);

  const localizedPhrases = (() => {
    const dest = (itinerary.destination || "").toLowerCase();
    if (dest.includes("india") || dest.includes("delhi") || dest.includes("agra") || dest.includes("jaipur") || dest.includes("lucknow") || dest.includes("varanasi") || dest.includes("mumbai") || dest.includes("goa") || dest.includes("rajasthan") || dest.includes("up") || dest.includes("pradesh")) {
      return [
        { name: '"Hello / Namaste":', value: "A warm Indian greeting." },
        { name: '"Dhanyavaad":', value: "Expressing gratitude." },
        { name: '"Yeh kitne ka hai?":', value: "Handy for local markets." }
      ];
    }
    if (dest.includes("spain") || dest.includes("mexico") || dest.includes("barcelona") || dest.includes("madrid") || dest.includes("colombia") || dest.includes("argentina")) {
      return [
        { name: '"Hola / Bienvenido":', value: "A warm Spanish greeting." },
        { name: '"Gracias":', value: "Expressing gratitude." },
        { name: '"¿Cuánto cuesta esto?":', value: "Handy for local markets." }
      ];
    }
    if (dest.includes("france") || dest.includes("paris") || dest.includes("lyon") || dest.includes("marseille")) {
      return [
        { name: '"Bonjour / Bienvenue":', value: "A warm French greeting." },
        { name: '"Merci beaucoup":', value: "Expressing gratitude." },
        { name: '"Combien ça coûte?":', value: "Handy for local markets." }
      ];
    }
    if (dest.includes("italy") || dest.includes("rome") || dest.includes("milan") || dest.includes("venice") || dest.includes("florence")) {
      return [
        { name: '"Ciao / Benvenuto":', value: "A warm Italian greeting." },
        { name: '"Grazie mille":', value: "Expressing gratitude." },
        { name: '"Quanto costa questo?":', value: "Handy for local markets." }
      ];
    }
    if (dest.includes("japan") || dest.includes("tokyo") || dest.includes("kyoto") || dest.includes("osaka")) {
      return [
        { name: '"Konnichiwa":', value: "A warm Japanese greeting." },
        { name: '"Arigatou gozaimasu":', value: "Expressing gratitude." },
        { name: '"Kore wa ikura desu ka?":', value: "Handy for local markets." }
      ];
    }
    if (dest.includes("azerbaijan") || dest.includes("baku")) {
      return [
        { name: '"Salam":', value: "Hello / a common greeting." },
        { name: '"Çox sağ olun":', value: "Thank you." },
        { name: '"Bu neçəyədir?":', value: "How much is this?" }
      ];
    }
    if (dest.includes("indonesia") || dest.includes("bali")) {
      return [
        { name: '"Halo":', value: "Hello." },
        { name: '"Terima kasih":', value: "Thank you." },
        { name: '"Berapa harganya?":', value: "How much is it?" }
      ];
    }
    return [
      { name: '"Hello / Welcome":', value: "A warm local greeting." },
      { name: '"Thank you":', value: "Expressing gratitude." },
      { name: '"How much is this?":', value: "Handy for open markets." }
    ];
  })();

  localizedPhrases.forEach((p, idx) => {
    const py = y + 16 + (idx * 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(p.name, rightColX + 5, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(p.value, rightColX + 38, py);
  });

  // ==========================================
  // PAGE 3: RECOMMENDATIONS (SIGHTSEEING & FOOD)
  // ==========================================
  const hasSightseeing = itinerary.placesToVisit && itinerary.placesToVisit.length > 0;
  const hasFood = itinerary.localFood && itinerary.localFood.length > 0;

  if (hasSightseeing || hasFood) {
    startSectionPage("02", "TRAVEL RECOMMENDATIONS & SPECIALTIES", "Handpicked sightseeing points of interest and authentic local culinary guide.");

    // Beautiful introduction on the Section Start page itself!
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Bespoke Local Experiences", marginX, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const recommendationIntro = `Every destination possesses a unique spirit, manifested through its historic monuments, local landmarks, and culinary specialties. In this chapter, we present a curated portfolio of sightseeing recommendations and iconic regional foods handpicked for your trip. For each selection, we include dynamic quality ratings, estimated admission costs, and optimized visiting hours.`;
    doc.text(doc.splitTextToSize(recommendationIntro, 180), marginX, y);
    y += 24;

    // Beautiful teaser preview cards for landmarks & culinary items
    if (itinerary.placesToVisit && itinerary.placesToVisit.length > 0) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, y, 180, 11, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(13, 148, 136);
      doc.text("FEATURED SIGHTSEEING", marginX + 4, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${itinerary.placesToVisit.length} curated landmarks and historic monuments`, marginX + 46, y + 7);
      y += 14;
    }

    if (itinerary.localFood && itinerary.localFood.length > 0) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, y, 180, 11, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(217, 119, 6);
      doc.text("CULINARY ADVENTURES", marginX + 4, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${itinerary.localFood.length} traditional delicacies and eatery spots`, marginX + 46, y + 7);
      y += 14;
    }

    // Now start drawing content dynamically without forced blank pages!
    if (hasSightseeing) {
      checkPageEnd(45);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(13, 148, 136);
      doc.text("Top Landmarks & Local Attractions", marginX, y);
      y += 6;

      itinerary.placesToVisit.forEach((place, idx) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const descLines = doc.splitTextToSize(place.description, 126);
        const heightNeeded = Math.max(30, 14 + (descLines.length * 4.2)) + 6;
        checkPageEnd(heightNeeded);

        drawPremiumCard(doc, marginX, y, 180, heightNeeded - 2, 2, 2, [13, 148, 136]);

        drawComingSoonPlaceholder(doc, marginX + 4, y + 4, 38, 22, "attraction");

        const contentX = marginX + 42;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${place.name}`, contentX, y + 6.5);

        const rating = 4.5 + (idx % 5) * 0.1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(245, 158, 11);
        const ratingVal = rating.toFixed(1);
        doc.text(`Rating: ${ratingVal} / 5.0`, contentX + 110, y + 6.5, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(descLines, contentX, y + 12);

        const detailY = Math.min(y + heightNeeded - 7.5, y + 12 + (descLines.length * 4.2) + 2);
        
        // Badge 1: Best Time (Sky blue, wider & centered with calendar icon)
        drawCenteredBadge(doc, contentX, detailY, 63, 4.5, `Best Time: ${place.bestTimeToVisit}`, undefined, [240, 249, 255], [2, 132, 199], "calendar");

        // Badge 2: Entry Fee (using dynamically-sized drawPriceBadge helper, wider for full visibility)
        drawPriceBadge(doc, contentX + 67, detailY, 63, 4.5, `Entry: ${place.entryFee}`);

        y += heightNeeded + 4;
      });
      y += 4;
    }

    if (hasFood) {
      checkPageEnd(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(13, 148, 136);
      doc.text("Culinary Specialties & Eatery Guide", marginX, y);
      y += 6;

      itinerary.localFood.forEach((food, idx) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const descLines = doc.splitTextToSize(food.description, 126);
        const heightNeeded = Math.max(30, 14 + (descLines.length * 4.2)) + 6;
        checkPageEnd(heightNeeded);

        drawPremiumCard(doc, marginX, y, 180, heightNeeded - 2, 2, 2, [217, 119, 6], [254, 251, 243]);

        drawComingSoonPlaceholder(doc, marginX + 4, y + 4, 38, 22, "food");

        const contentX = marginX + 46;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${food.name}`, contentX, y + 6.5);

        doc.setFillColor(254, 243, 199);
        doc.roundedRect(contentX + 106, y + 3.5, 18, 4, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(217, 119, 6);
        doc.text(String(food.type || "Veg").toUpperCase(), contentX + 115, y + 6.3, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(descLines, contentX, y + 12);

        const detailY = Math.min(y + heightNeeded - 7.5, y + 12 + (descLines.length * 4.2) + 2);
        const simulatedRating = (4.4 + (idx % 6) * 0.1).toFixed(1);
        const estimatedPrice = estimateFoodPriceRange(food, idx, itinerary, currencySym);

        // Badge 1: Must Try (Amber, wider and perfectly centered)
        drawCenteredBadge(doc, contentX, detailY, 60, 4.5, `Must Try: ${food.mustTryAt}`, undefined, [254, 243, 199], [217, 119, 6]);

        // Badge 2: Rating (Emerald, centered beautifully)
        drawCenteredBadge(doc, contentX + 64, detailY, 28, 4.5, `Rating: ${simulatedRating}`, undefined, [236, 253, 245], [13, 148, 136]);

        // Badge 3: Cost (using drawPriceBadge helper with auto-scaling font size)
        drawPriceBadge(doc, contentX + 96, detailY, 34, 4.5, `Avg: ${estimatedPrice}`);

        y += heightNeeded + 4;
      });
    }
  }

  // Pre-load Directions QR Codes
  const qrCodes: Record<number, string | null> = {};
  if (itinerary.days && itinerary.days.length > 0) {
    await Promise.all(
      itinerary.days.map(async (day) => {
        const lastAct = day.activities[day.activities.length - 1];
        const destParam = lastAct ? lastAct.location || lastAct.title : itinerary.destination;
        const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destParam)}`;
        const apiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(dirUrl)}`;
        const base64 = await loadImgUrlBase64(apiQrUrl);
        qrCodes[day.dayNumber] = base64;
      })
    );
  }

  // ==========================================
  // PAGE 4+: CHRONOLOGICAL ITINERARY (Vertical Timeline)
  // ==========================================
  const daysData = itinerary.days || [];
  if (daysData.length > 0) {
    startSectionPage("03", "DAILY PLANS & CHRONOLOGICAL ITINERARY", "Your bespoke timeline schedules, route estimations, and navigation helpers.");

    // Beautiful introduction on the Section Start page itself!
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Master Schedule Overview", marginX, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const timelineIntro = `This section presents your comprehensive day-by-day chronological itinerary. Each day features unique cultural encounters, localized dining opportunities, specific transport suggestions, and active route mapping. Use the high-resolution mobile navigation QR codes on each page to seamlessly sync directions with your device's maps.`;
    doc.text(doc.splitTextToSize(timelineIntro, 180), marginX, y);
    y += 24;

    // Beautiful visual showcase list of days
    daysData.slice(0, 5).forEach((day, idx) => {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, y, 180, 11, 1, 1, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(13, 148, 136);
      doc.text(`DAY ${day.dayNumber}`, marginX + 4, y + 7.2);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(day.theme, marginX + 22, y + 7.2);
      y += 14;
    });

    daysData.forEach((day, dIdx) => {
      // Calculate estimated space needed for day header, stats and initial activities.
      // If we are on the first day, start on a fresh page. Otherwise, flow continuously if space permits.
      if (dIdx === 0 || y + 70 > 262) {
        doc.addPage();
        y = 25;
        pageSectionNames[doc.getNumberOfPages()] = currentSectionName;
      } else {
        // Draw a clean elegant thin separator between days when sharing a page
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(marginX, y, marginX + 180, y);
        y += 8;
      }

      // Pre-calculate daily financial calculations to ensure complete consistency!
      const activitySubtotalNum = day.activities.reduce((sum, act) => sum + parseVal(act.cost), 0);
      let budgetNum = parseVal(day.dailyBudget);
      const estimatedTotalSpendNum = parseVal((day as any).estimatedTotalSpend) || budgetNum || activitySubtotalNum;
      if (budgetNum === 0) budgetNum = estimatedTotalSpendNum;

      const displayBudget = currencySym + budgetNum.toLocaleString();
      const displaySpend = currencySym + estimatedTotalSpendNum.toLocaleString();
      const remainingNum = Math.max(0, budgetNum - estimatedTotalSpendNum);
      const displayRemaining = currencySym + remainingNum.toLocaleString();
      const spendNum = estimatedTotalSpendNum;

      // Day Header Banner
      drawPremiumCard(doc, marginX, y, 180, 10, 1.5, 1.5, [13, 148, 136], [240, 253, 250]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(13, 148, 136);
      doc.text(`DAY ${day.dayNumber}: ${day.theme.toUpperCase()}`, marginX + 5, y + 6.8);
      y += 13;

      // Quick parameters stats
      const actCount = day.activities?.length || 0;
      const routeDistance = (day.activities || []).reduce((sum: number, a: any) => sum + (Number(a.distanceFromPreviousKm) || 0), 0);
      const walkingDistance = (day.activities || []).reduce((sum: number, a: any) => /walk/i.test(String(a.transportFromPrevious || '')) ? sum + (Number(a.distanceFromPreviousKm) || 0) : sum, 0);
      const routeMinutes = (day.activities || []).reduce((sum: number, a: any) => {
        const txt=String(a.travelTimeFromPrevious||''); const h=Number((txt.match(/(\d+)h/)||[])[1]||0); const m=Number((txt.match(/(\d+)m/)||[])[1]||0); const min=Number((txt.match(/(\d+) min/)||[])[1]||0); return sum+h*60+m+min;
      }, 0);
      const dist = routeDistance > 0 ? routeDistance.toFixed(1) : "N/A";
      const travTime = routeMinutes > 0 ? `${Math.floor(routeMinutes/60)}h ${routeMinutes%60}m` : "Route based";

      let weatherLabel = "Season-aware planning";
      if (headerWeather && headerWeather[dIdx]) {
        let cond = headerWeather[dIdx].condition || "Clear";
        if (cond.length > 24) {
          cond = cond.substring(0, 21) + "...";
        }
        weatherLabel = `${cond}, ${headerWeather[dIdx].tempMax || "24"}°C`;
      }

      const dStats = [
        { label: "EST. DAILY REQUIREMENT", value: displayBudget, bg: [236, 253, 245], border: [13, 148, 136], txt: [13, 148, 136], icon: "budget" },
        { label: headerWeather && headerWeather[dIdx] ? "WEATHER FORECAST" : "WEATHER GUIDANCE", value: weatherLabel, bg: [240, 249, 255], border: [2, 132, 199], txt: [2, 132, 199], icon: "weather" },
        { label: "ROUTE DISTANCE", value: dist === "N/A" ? "N/A" : `${dist} km`, bg: [255, 241, 242], border: [225, 29, 72], txt: [225, 29, 72], icon: "distance" },
        { label: "TRANSIT TIME", value: travTime, bg: [238, 242, 255], border: [79, 70, 229], txt: [79, 70, 229], icon: "time" }
      ];

      const sw = 42;
      dStats.forEach((stat, idx) => {
        const sx = marginX + (idx * 45);
        const isBudget = stat.icon === "budget";
        drawPremiumCard(doc, sx, y, sw, 15, 1.5, 1.5, stat.border, stat.bg);

        if (isBudget) {
          // Double-border style for premium highlight
          doc.setDrawColor(204, 251, 241);
          doc.setLineWidth(0.4);
          doc.roundedRect(sx + 0.8, y + 0.8, sw - 1.6, 13.4, 1.2, 1.2, "D");
          drawWalletIcon(doc, sx + 5.5, y + 7.5, stat.txt);
        } else {
          if (stat.icon === "weather") drawWeatherIcon(doc, sx + 5.5, y + 7.5, stat.txt);
          else if (stat.icon === "distance") drawMapPinIcon(doc, sx + 5.5, y + 7.5, stat.txt);
          else if (stat.icon === "time") drawClockIcon(doc, sx + 5.5, y + 7.0, stat.txt);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(stat.label, sx + (isBudget ? 12.5 : 11.5), y + 6);

        doc.setFont("helvetica", "bold");
        let fs = isBudget ? 9.5 : 8;
        if (stat.icon === "weather") {
          if (stat.value.length > 24) {
            fs = 5.0;
          } else if (stat.value.length > 18) {
            fs = 6.0;
          } else if (stat.value.length > 13) {
            fs = 7.0;
          }
        }
        doc.setFontSize(fs);
        doc.setTextColor(stat.txt[0], stat.txt[1], stat.txt[2]);
        doc.text(stat.value, sx + (isBudget ? 12.5 : 11.5), y + 10.8);
      });
      y += 19;

      const colStartY = y;

      // Left chronological timeline (now occupying full width!)
      let currentTimelineY = colStartY;
      day.activities.forEach((act, actIdx) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        // Using full width splitting! Card width is 146, so 138 is perfect for text margin.
        const actLines = doc.splitTextToSize(act.description, 138);
        // Dynamic height based on lines
        const actHeight = 6 + (actLines.length * 3.5) + 10;

        // Solid Connecting Line - stops cleanly at last activity marker
        const isLastActivity = actIdx === day.activities.length - 1;
        doc.setDrawColor(13, 148, 136);
        doc.setLineWidth(0.6);
        if (!isLastActivity) {
          doc.line(marginX + 6, currentTimelineY + 3.5, marginX + 6, currentTimelineY + actHeight + 4);
        }

        // Circular Timeline Marker with Period Icon
        const period = getActivityPeriod(act.time || "09:00 AM");
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(13, 148, 136);
        doc.setLineWidth(0.8);
        doc.circle(marginX + 6, currentTimelineY + 3.5, 5, "FD");

        drawPeriodIcon(doc, marginX + 6, currentTimelineY + 3.5, period, [13, 148, 136]);

        // Subtle Separator line between activities - now spans full width
        if (!isLastActivity) {
          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.35);
          doc.line(marginX + 34, currentTimelineY + actHeight + 2, marginX + 34 + 146, currentTimelineY + actHeight + 2);
        }

        // Time Badge (colored box) - shortened to fit perfectly and beautifully
        const shortTime = (act.time || "09:00 AM").includes("/")
          ? (act.time || "09:00 AM").split("/")[0].trim()
          : (act.time || "09:00 AM");

        const leftBoxX = marginX + 12;
        const leftBoxW = 21;
        const leftBoxH = 5.2;
        const leftBoxY = currentTimelineY + 0.9;

        drawPremiumCard(doc, leftBoxX, leftBoxY, leftBoxW, leftBoxH, 1, 1, undefined, [15, 23, 42]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(shortTime, leftBoxX + leftBoxW / 2, leftBoxY + leftBoxH / 2 + 0.9, { align: "center" });

        // Activity details card - now occupies full width 146!
        const cardX = marginX + 34;
        const cardW = 146;
        drawPremiumCard(doc, cardX, currentTimelineY, cardW, actHeight, 1.5, 1.5, [13, 148, 136]);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(act.title, cardX + 4, currentTimelineY + 4.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(actLines, cardX + 4, currentTimelineY + 8);

        // Render comprehensive 6 badges inside full width card
        const dividerY = currentTimelineY + 5.5 + (actLines.length * 3.5);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(cardX + 4, dividerY, cardX + cardW - 4, dividerY);

        const badgeY1 = dividerY + 3.2;
        const badgeY2 = dividerY + 7.2;

        // Row 1 - Badge 1: Time (Spacious)
        drawClockIcon(doc, cardX + 6, badgeY1 - 0.8, [13, 148, 136]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`Time: ${act.time || "09:00 AM"}`, cardX + 9, badgeY1);

        // Row 1 - Badge 2: Location (Highly Spacious, No Truncation!)
        drawMapPinIcon(doc, cardX + 50, badgeY1 - 0.8, [13, 148, 136]);
        const rawLoc = act.location || "Central";
        doc.text(`Loc: ${rawLoc}`, cardX + 53, badgeY1);

        // Row 2 - Badge 3: Duration. Use the validated itinerary duration rather than a simulated placeholder.
        const simulatedDuration = String((act as any).visitDuration || "1h").trim();
        doc.setFillColor(238, 242, 255);
        doc.roundedRect(cardX + 4, badgeY2 - 3, 15, 4.2, 0.8, 0.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(79, 70, 229);
        doc.text(simulatedDuration, cardX + 11.5, badgeY2 - 0.1, { align: "center" });

        // Row 2 - Badge 4: Transport (Balanced Icon & Text Center Grouping)
        const simulatedTransit = String((act as any).transportFromPrevious || (act as any).transport || (actIdx === 0 ? "Start of day" : "Cab"))
          .replace(/dayPremium/ig, "day • Premium")
          .replace(/vehicleCheck/ig, "vehicle • Check")
          .replace(/transitCheck/ig, "transit • Check")
          .replace(/taxiFine/ig, "taxi • Fine")
          .trim();
        const transitBoxX = cardX + 23;
        const transitBoxW = 24;
        const transitTextWidth = simulatedTransit.length * 0.85;
        const transitUnitWidth = 3 + 1.2 + transitTextWidth;
        const transitBoxCenterX = transitBoxX + transitBoxW / 2;
        const transitUnitStartX = transitBoxCenterX - (transitUnitWidth / 2);

        doc.setFillColor(240, 249, 255);
        doc.roundedRect(transitBoxX, badgeY2 - 3, transitBoxW, 4.2, 0.8, 0.8, "F");
        drawTransportIcon(doc, transitUnitStartX + 1.5, badgeY2 - 0.9, simulatedTransit, [2, 132, 199]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(2, 132, 199);
        doc.text(simulatedTransit, transitUnitStartX + 4.2, badgeY2 - 0.1, { align: "left" });

        // Row 2 - Badge 5: Cost (Perfect Centering)
        const rawCostVal = String(act.cost || "Included")
          .replace(/vehicleCheck/ig, "vehicle • Check")
          .replace(/transitCheck/ig, "transit • Check")
          .replace(/taxiFine/ig, "taxi • Fine")
          .trim();
        // Leading separator keeps adjacent metadata badges visually and textually distinct in exported PDFs.
        const costVal = `\u00A0• ${rawCostVal}`;
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(cardX + 51, badgeY2 - 3, 24, 4.2, 0.8, 0.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(217, 119, 6);
        doc.text(costVal, cardX + 63, badgeY2 - 0.1, { align: "center" });

        // Row 2 - Badge 6: Weather (Proportional Center Grouping based on forecast length)
        let weatherVal = "Season-aware";
        if (headerWeather && headerWeather[dIdx]) {
          const cond = headerWeather[dIdx].condition || "Clear";
          const temp = headerWeather[dIdx].tempMax || "24";
          weatherVal = `${cond}, ${temp}°C`;
        }
        const weatherBoxX = cardX + 79;
        const weatherBoxW = 63;
        const weatherCharWidth = 0.85;
        const weatherTextWidth = weatherVal.length * weatherCharWidth;
        const weatherUnitWidth = 3 + 1.5 + weatherTextWidth;
        const weatherBoxCenterX = weatherBoxX + weatherBoxW / 2;
        const weatherUnitStartX = weatherBoxCenterX - (weatherUnitWidth / 2);

        doc.setFillColor(236, 253, 245);
        doc.roundedRect(weatherBoxX, badgeY2 - 3, weatherBoxW, 4.2, 0.8, 0.8, "F");
        drawWeatherIcon(doc, weatherUnitStartX + 1.5, badgeY2 - 0.9, [13, 148, 136]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(13, 148, 136);
        doc.text(weatherVal, weatherUnitStartX + 4.5, badgeY2 - 0.1, { align: "left" });

        doc.setFontSize(7.5); // Restore default font size
        currentTimelineY += actHeight + 4;
      });

      // Side-by-side bottom panels (MOBILE NAVIGATION on Left, ROUTE TIMELINE on Right)
      const panelY = currentTimelineY + 6;
      const panelH = 32;

      // Draw MOBILE NAVIGATION Card on the Left (width 87)
      drawPremiumCard(doc, marginX, panelY, 87, panelH, 2, 2, [13, 148, 136], [248, 250, 252]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("MOBILE NAVIGATION", marginX + 4, panelY + 5.5);

      const qrB64 = qrCodes[day.dayNumber];
      if (qrB64) {
        try {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(marginX + 87/2 - 11, panelY + 7, 22, 22, 1, 1, "F");
          doc.addImage(qrB64, "PNG", marginX + 87/2 - 10, panelY + 8, 20, 20);
        } catch (e) {
          drawFallbackQRCode(doc, marginX + 87/2 - 10, panelY + 7, 20);
        }
      } else {
        drawFallbackQRCode(doc, marginX + 87/2 - 10, panelY + 7, 20);
      }

      // Draw ROUTE TIMELINE Card on the Right (width 87)
      drawMiniRouteMap(doc, marginX + 93, panelY, 87, panelH, day.activities);

      y = panelY + panelH + 5;

      // Bottom colored daily budget summary card
      checkPageEnd(28);
      
      // Draw premium dashboard container card
      drawPremiumCard(doc, marginX, y, 180, 24, 2, 2, [13, 148, 136], [240, 253, 250]);

      // Vertical separators for column grid feel
      doc.setDrawColor(204, 251, 241);
      doc.setLineWidth(0.3);
      doc.line(marginX + 58, y + 3, marginX + 58, y + 13);
      doc.line(marginX + 118, y + 3, marginX + 118, y + 13);

      // --- Column 1: Daily Budget ---
      drawWalletIcon(doc, marginX + 8, y + 5.5, [13, 148, 136]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("EST. DAILY REQUIREMENT", marginX + 14, y + 5.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(displayBudget, marginX + 14, y + 10.2);

      // --- Column 2: Estimated Spend ---
      drawDollarIcon(doc, marginX + 66, y + 5.5, [79, 70, 229]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("EST. TOTAL DAY COST", marginX + 72, y + 5.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(displaySpend, marginX + 72, y + 10.2);

      // --- Column 3: Remaining Balance ---
      const hasOverspent = budgetNum > 0 && spendNum > budgetNum;
      const remColor = hasOverspent ? [239, 68, 68] : [16, 185, 129];
      
      // Draw tiny status circle for remaining
      doc.setFillColor(remColor[0], remColor[1], remColor[2]);
      doc.circle(marginX + 126, y + 5.0, 1.2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("VARIANCE RESERVE", marginX + 131, y + 5.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(remColor[0], remColor[1], remColor[2]);
      doc.text(displayRemaining, marginX + 131, y + 10.2);

      const dailyParts: any = (day as any).dailyCostBreakdown;
      if (dailyParts) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.6);
        doc.setTextColor(71, 85, 105);
        const detail = `Stay ${dailyParts.accommodation} • Food ${dailyParts.food} • Local transport ${dailyParts.localTransport} • Activities ${dailyParts.activities} • Other ${dailyParts.miscellaneous}`;
        doc.text(doc.splitTextToSize(detail, 164), marginX + 8, y + 13.2);
      }

      // --- Progress Bar ---
      const barX = marginX + 8;
      const barY = y + 17.2;
      const barW = 164;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, barY, barW, 2.4, 1.0, 1.0, "F");

      const spendPercent = budgetNum > 0 ? Math.min(100, (spendNum / budgetNum) * 100) : 50;
      if (spendPercent > 0) {
        if (hasOverspent) {
          doc.setFillColor(239, 68, 68);
        } else {
          doc.setFillColor(13, 148, 136);
        }
        doc.roundedRect(barX, barY, barW * (spendPercent / 100), 2.4, 1.0, 1.0, "F");
      }

      // Subtext allocation ratio
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`Daily total covers destination spend. Flights and trip-level protection are shown separately.`, marginX + 8, y + 23.5);

      y += 30;
    });
  }

  // ==========================================
  // PAGE: CURATED HOTELS
  // ==========================================
  startSectionPage("04", "CURATED ACCOMMODATION PORTFOLIO", "A handpicked compilation of hotel recommendations graded by luxury & comfort.");

  // Beautiful introduction on the Section Start page itself!
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(13, 148, 136);
  doc.text("Lodging Graded Index", marginX, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const lodgingStyle = String(itinerary.travelStyle || '').toLowerCase().trim();
  const preferredLodging = lodgingStyle === 'luxury' ? 'Luxury Retreats' : lodgingStyle === 'smart luxury' ? 'Mid-Range / Boutique Suites' : (lodgingStyle === 'budget' || lodgingStyle === 'backpacker') ? 'Budget Stays' : 'style-appropriate stays';
  const hotelData = itinerary.hotelRecommendations || { budget: [], midRange: [], luxury: [] };
  const hasHotelCards = ['budget','midRange','luxury'].some((k) => Array.isArray((hotelData as any)[k]) && (hotelData as any)[k].length > 0);
  const sectionHasAgodaRates = [hotelData.budget, hotelData.midRange, hotelData.luxury].some((list: any) => Array.isArray(list) && list.some((h: any) => h?.source === "agoda"));
  const lodgingIntro = hasHotelCards
    ? sectionHasAgodaRates
      ? `Finding the right stay is essential to the itinerary. For your selected ${itinerary.travelStyle || 'travel'} style, TripBalancing prioritizes ${preferredLodging} first, then shows other tiers as reference alternatives. The properties below use live Agoda rates for your selected dates; verify final taxes, availability and cancellation terms on Agoda before booking.`
      : `Finding the right stay is essential to the itinerary. For your selected ${itinerary.travelStyle || 'travel'} style, TripBalancing prioritizes ${preferredLodging} first, then shows other tiers as reference alternatives. The properties below are planning references with estimated nightly guidance; verify live rates, availability, taxes, reviews and cancellation terms before booking.`
    : `TripBalancing has calculated an accommodation allowance for this trip, but no sufficiently reliable property-level recommendations were available for this destination. Use the style-appropriate tiers below as a planning guide and verify live hotel options before booking.`;
  doc.text(doc.splitTextToSize(lodgingIntro, 180), marginX, y);
  y += 24;

  // Render tiny teaser preview boxes for hotel classes on cover page
  const allHotelTiers = [
    { key: 'budget', name: "BUDGET STAYS", comfort: "Value Comfort", price: "Best rates", txt: [13, 148, 136] },
    { key: 'midRange', name: "MID-RANGE SUITES", comfort: "Premium Comfort", price: "Top quality suites", txt: [79, 70, 229] },
    { key: 'luxury', name: "LUXURY RETREATS", comfort: "Ultra Luxury", price: "Five-star premium", txt: [217, 119, 6] }
  ];
  const preferredTierKey = lodgingStyle === 'luxury' ? 'luxury' : lodgingStyle === 'smart luxury' ? 'midRange' : (lodgingStyle === 'budget' || lodgingStyle === 'backpacker') ? 'budget' : 'midRange';
  const hotelTiers = [...allHotelTiers].sort((a,b)=>Number(b.key===preferredTierKey)-Number(a.key===preferredTierKey));
  hotelTiers.forEach((tier, idx) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, y, 180, 11, 1, 1, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(tier.txt[0], tier.txt[1], tier.txt[2]);
    doc.text(tier.name, marginX + 4, y + 7.2);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${tier.comfort}  •  ${tier.price}`, marginX + 42, y + 7.2);
    y += 14;
  });

  const accommodationAllowance = parseVal(itinerary.estimatedBudgetBreakdown?.accommodation || "0");
  const startMs = itinerary.startDate ? new Date(`${itinerary.startDate}T00:00:00`).getTime() : NaN;
  const endMs = itinerary.endDate ? new Date(`${itinerary.endDate}T00:00:00`).getTime() : NaN;
  const hotelNights = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 86400000)) : 0;
  const nightlyAllowance = hotelNights > 0 ? Math.round(accommodationAllowance / hotelNights) : 0;
  if (nightlyAllowance > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(13, 148, 136);
    const hasAgodaRates = [hotelData.budget, hotelData.midRange, hotelData.luxury].some((list: any) => Array.isArray(list) && list.some((h: any) => h?.source === "agoda"));
    doc.text(`Trip accommodation allowance: ${currencySym}${nightlyAllowance.toLocaleString()} per night (${hotelNights} night${hotelNights === 1 ? "" : "s"}). ${hasAgodaRates ? "Hotel prices below are live Agoda rates for the selected dates." : "Recommendations below are planning estimates, not a forced tier."}`, marginX, y);
    y += 7;
  }

  const renderTier = (tierName: string, list: any[], color: [number, number, number], comfortLabel: string) => {
    if (!Array.isArray(list) || list.length === 0) return;
    // Keep the tier heading with at least two hotel cards and use compact cards to prevent one-hotel orphan pages.
    checkPageEnd(Math.min(74, 12 + Math.min(2, list.length) * 29));
    drawPremiumCard(doc, marginX, y, 180, 8, 1, 1, color, color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    drawSpacedText(doc, `${tierName.toUpperCase()} - ${comfortLabel.toUpperCase()}`, marginX + 4, y + 5.5, 0.4, "left");
    y += 12;

    list.forEach((hotel) => {
      checkPageEnd(29);
      drawPremiumCard(doc, marginX, y, 180, 26, 1.5, 1.5, color);

      // Left Image for hotels (larger size 38x24 for luxury magazine style)
      drawComingSoonPlaceholder(doc, marginX + 4, y + 3, 34, 20, "hotel");

      const contentX = marginX + 46;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(String(hotel.name || ""), contentX, y + 6.5);

      const ratingValue = Number(hotel.rating);
      if (Number.isFinite(ratingValue) && ratingValue > 0) {
        const stars = Math.max(1, Math.min(5, Math.round(ratingValue)));
        for (let s = 0; s < 5; s++) {
          doc.setFillColor(s < stars ? 245 : 226, s < stars ? 158 : 232, s < stars ? 11 : 240);
          drawStar(doc, contentX + (s * 4.5), y + 10.5, 1.6);
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text('RATING: CHECK LIVE', contentX, y + 11);
      }

      // Badges (spacious & mathematically centered layout using full 130mm available width)
      // Price badge (using auto-scaling font size, width 48)
      drawPriceBadge(doc, contentX, y + 14.5, 48, 5, /\/\s*night\b/i.test(String(hotel.pricePerNight)) ? String(hotel.pricePerNight) : `${hotel.pricePerNight} / night`);

      // Distance badge (width 34, centered map pin icon + distance text)
      const hotelLocationBadge = hotel?.source === "agoda" ? String(hotel.distanceFromCenter || "Agoda live") : `${hotel.distanceFromCenter} to Ctr`;
      drawCenteredBadge(doc, contentX + 52, y + 14.5, 34, 5, hotelLocationBadge, undefined, [238, 242, 255], [79, 70, 229], "map");

      // Comfort level badge (width 40, centered hotel icon + comfort label text)
      drawCenteredBadge(doc, contentX + 90, y + 14.5, 40, 5, comfortLabel.toUpperCase(), undefined, [254, 243, 199], [217, 119, 6], "hotel");

      const hotelDesc = String(hotel.description || (hotel?.source === "agoda" ? `Live Agoda rate. Open the Agoda booking link in TripBalancing to verify room type, taxes and cancellation terms.` : `${comfortLabel} option. Verify live availability, room type, taxes and cancellation terms before booking.`));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(doc.splitTextToSize(hotelDesc, 126).slice(0, 2), contentX, y + 24.0);

      y += 29;
    });
    y += 2;
  };

  const tierRenderers: Record<string, () => void> = {
    budget: () => renderTier("Budget Stays", hotelData.budget || [], [13, 148, 136], preferredTierKey === 'budget' ? "Recommended for your style" : "Value Comfort"),
    midRange: () => renderTier("Mid-Range Suites", hotelData.midRange || [], [79, 70, 229], preferredTierKey === 'midRange' ? "Recommended for your style" : "Premium Comfort"),
    luxury: () => renderTier("Luxury Retreats", hotelData.luxury || [], [217, 119, 6], preferredTierKey === 'luxury' ? "Recommended for your style" : "Ultra Luxury")
  };
  [preferredTierKey, ...['budget','midRange','luxury'].filter(k => k !== preferredTierKey)].forEach(k => tierRenderers[k]());

  // ==========================================
  // PAGE: BUDGET & FINANCIAL PLANNER
  // ==========================================
  const b = itinerary.estimatedBudgetBreakdown;
  if (b) {
    const financialStyle = String(itinerary.travelStyle || "").toLowerCase().trim();
    const financialSectionSubtitle = financialStyle === "luxury"
      ? "Consolidated cost breakdowns, premium dining metrics, and luxury travel allocations."
      : financialStyle === "food explorer"
        ? "Consolidated cost breakdowns with food-led dining, activity, stay, and transport allocations."
        : `Consolidated cost breakdowns and ${itinerary.travelStyle || "travel"}-appropriate trip allocations.`;
    startSectionPage("05", "FINANCIAL PLANNER & ALLOCATIONS", financialSectionSubtitle);

    // Beautiful introduction on the Section Start page itself!
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Financial Strategy Blueprint", marginX, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const plannedBudgetText = (itinerary as any).plannedBudget || itinerary.budgetAmount || "Not specified";
    const estimatedCostText = (itinerary as any).realisticEstimatedCost || b.total || "Calculating";
    const shortfallText = (itinerary as any).budgetShortfall || "0";
    const budgetIntro = (itinerary as any).isAiBudgetPlanner
      ? `This financial blueprint separates the AI recommended safe budget (${plannedBudgetText}) from the realistic estimated trip cost (${estimatedCostText}). The difference is a recommended safety buffer for normal price variation, not unused or leftover money. Category values below reconcile to the realistic estimate. Prices remain estimates and may vary with dates, availability, exchange rates, and booking time.`
      : `This financial blueprint separates your planned budget (${plannedBudgetText}) from the realistic estimated trip cost (${estimatedCostText}). The category values below are reconciled to the calculated estimate, not forced into the planned amount. Estimated shortfall: ${shortfallText}. Prices remain estimates and may vary with dates, availability, exchange rates, and booking time.`;
    doc.text(doc.splitTextToSize(budgetIntro, 180), marginX, y);
    y += 24;

    // Visual indicators of budget categories
    const styleFinancialCopy: Record<string, { accommodation: string; food: string; activities: string; transit: string }> = {
      "budget": {
        accommodation: "Value stays, guesthouses & practical hotels",
        food: "Affordable local meals, cafes & street-food allowance",
        activities: "Low-cost sights, local experiences & entry fees",
        transit: "Public transport, shared rides & practical local travel"
      },
      "smart luxury": {
        accommodation: "High-value upscale stays & well-rated boutique hotels",
        food: "Quality local dining with selected premium experiences",
        activities: "Priority experiences balanced with strong value",
        transit: "Comfortable transfers with value-conscious local travel"
      },
      "luxury": {
        accommodation: "Upscale hotels, luxury resorts & premium stays",
        food: "Acclaimed restaurants, fine dining & signature tastings",
        activities: "Private, priority, spa & elevated experiences",
        transit: "Private/chauffeured transfers & premium local transport"
      },
      "adventure": {
        accommodation: "Practical stays positioned for active exploration",
        food: "Fuel-and-recovery meals for active travel days",
        activities: "Guided outdoor activities, gear & adventure fees",
        transit: "Transfers to trailheads, activity zones & outdoor routes"
      },
      "backpacker": {
        accommodation: "Hostels, guesthouses & low-cost social stays",
        food: "Street food, local cafes & backpacker meal allowance",
        activities: "Free/low-cost sights and social local experiences",
        transit: "Public transport, walking & economical shared travel"
      },
      "food explorer": {
        accommodation: "Comfortable stays near food districts & local neighborhoods",
        food: "Regional meals, markets, tastings & culinary experiences",
        activities: "Food walks, cooking/tasting experiences & supporting sights",
        transit: "Local travel between markets, eateries & culinary districts"
      },
      "wellness & spa": {
        accommodation: "Quiet wellness stays, resorts & restorative lodging",
        food: "Balanced dining, wellness meals & relaxed restaurant allowance",
        activities: "Spa, wellness, nature & restorative experiences",
        transit: "Comfortable low-stress transfers and local travel"
      },
      "culture & history": {
        accommodation: "Well-located stays near heritage and cultural districts",
        food: "Traditional regional dining & culturally relevant food stops",
        activities: "Museums, heritage sites, guides & cultural admissions",
        transit: "Local transport linking heritage and cultural areas"
      },
      "beach escape": {
        accommodation: "Beachside stays, resorts & coastal lodging",
        food: "Coastal dining, local seafood/veg options & beachside meals",
        activities: "Beach, water, sunset & coastal experiences",
        transit: "Coastal transfers and practical beach-area transport"
      },
      "nature & wildlife": {
        accommodation: "Nature-oriented stays with practical access to reserves",
        food: "Local meals and provisions for nature-focused days",
        activities: "Nature guides, wildlife visits, parks & outdoor admissions",
        transit: "Transfers to reserves, parks & scenic nature areas"
      },
      "shopping": {
        accommodation: "Convenient stays near markets and shopping districts",
        food: "Local dining breaks around shopping and market routes",
        activities: "Markets, artisan districts & shopping experiences",
        transit: "Convenient transport between retail and market areas"
      },
      "nightlife": {
        accommodation: "Well-located stays with safe late-night access",
        food: "Brunch, evening dining & nightlife food allowance",
        activities: "Evening entertainment, lounges & nightlife experiences",
        transit: "Verified late-night taxis/rides and safe return transport"
      }
    };
    const financialCopy = styleFinancialCopy[financialStyle] || {
      accommodation: "Travel-style appropriate stays and lodging",
      food: "Destination-appropriate meals and dining allowance",
      activities: "Sightseeing, experiences and admission fees",
      transit: "Local transport, transfers and tour travel"
    };
    const financialOverviewCategories = [
      { name: "ACCOMMODATION", desc: financialCopy.accommodation, txt: [13, 148, 136] },
      { name: "FOOD & DINING", desc: financialCopy.food, txt: [217, 119, 6] },
      { name: "ACTIVITIES & SIGHTSEEING", desc: financialCopy.activities, txt: [79, 70, 229] },
      { name: "TRANSIT & TOURS", desc: financialCopy.transit, txt: [2, 132, 199] }
    ];
    financialOverviewCategories.forEach((cat, idx) => {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, y, 180, 11, 1, 1, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(cat.txt[0], cat.txt[1], cat.txt[2]);
      doc.text(cat.name, marginX + 4, y + 7.2);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(cat.desc, marginX + 54, y + 7.2);
      y += 14;
    });

    // Check if there is enough space for the dashboard, otherwise break page naturally
    checkPageEnd(80);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Bespoke Cost Allocation Dashboard", marginX, y);
    y += 8;

    // Numerical breakdowns for Donut Chart & Stat Cards
    const accommVal = parseVal(b.accommodation);
    const foodVal = parseVal(b.food);
    const actVal = parseVal(b.activities);
    const localTransVal = parseVal(b.transport);
    const miscVal = parseVal(b.miscellaneous || "0");
    const transitVal = parseVal(b.originToDestinationTravel || "0");
    const visaInsuranceVal = parseVal((b as any).visaAndInsurance || "0");

    // Use the same categories as the detailed budget table. Do not merge unrelated
    // insurance or miscellaneous costs into local transport.
    const flightVal = transitVal;
    const totalVal = accommVal + foodVal + actVal + localTransVal + visaInsuranceVal + miscVal + flightVal || 1;

    const rawPcts = [
      (accommVal / totalVal) * 100,
      (foodVal / totalVal) * 100,
      (actVal / totalVal) * 100,
      (localTransVal / totalVal) * 100,
      (visaInsuranceVal / totalVal) * 100,
      (miscVal / totalVal) * 100,
      (flightVal / totalVal) * 100
    ];

    const percentages = rawPcts.map(v => Math.round(v));
    const pctSum = percentages.reduce((a, b) => a + b, 0);
    if (pctSum !== 100 && pctSum > 0) {
      const maxIdx = percentages.indexOf(Math.max(...percentages));
      percentages[maxIdx] += (100 - pctSum);
    }

    // Left Column: Donut Chart (Enlarged)
    const cx = 52;
    const cy = y + 40;
    const r = 28;
    const rInner = 14;

    let currentAngle = 0;
    const colors = [
      [13, 148, 136], // Accommodation - Teal
      [217, 119, 6],  // Food - Amber
      [79, 70, 229],  // Activities - Indigo
      [2, 132, 199],  // Local transport - Sky Blue
      [5, 150, 105],  // Visa / insurance - Emerald
      [100, 116, 139],// Miscellaneous - Slate
      [124, 58, 237]  // Flights - Violet
    ];

    percentages.forEach((pct, idx) => {
      if (pct <= 0) return;
      const endAngle = currentAngle + (pct * 3.6);
      drawPieSector(doc, cx, cy, r, currentAngle, endAngle, colors[idx]);
      currentAngle = endAngle;
    });

    // Ring lines
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.circle(cx, cy, r + 0.5, "D");

    // Hole to turn Pie into Donut
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, rInner, "F");

    doc.setDrawColor(226, 232, 240);
    doc.circle(cx, cy, rInner - 0.5, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("BUDGET", cx, cy - 1.8, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("RATIOS", cx, cy + 2.2, { align: "center" });

    // Donut Legend (Repositioned for larger chart)
    const lx = marginX;
    const ly = cy + 38;
    const legendItems = [
      { name: "Accommodation", color: [13, 148, 136], pct: percentages[0] },
      { name: "Meals & Food", color: [217, 119, 6], pct: percentages[1] },
      { name: "Activities", color: [79, 70, 229], pct: percentages[2] },
      { name: "Local Transport", color: [2, 132, 199], pct: percentages[3] },
      { name: "Visa / Insurance", color: [5, 150, 105], pct: percentages[4] },
      { name: "Miscellaneous", color: [100, 116, 139], pct: percentages[5] },
      { name: "Flights", color: [124, 58, 237], pct: percentages[6] }
    ];

    legendItems.forEach((item, idx) => {
      const lY = ly + (idx * 5.5);
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.circle(lx + 2, lY - 1, 1.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${item.name}: ${item.pct}%`, lx + 6, lY);
    });

    // Right Column: Progress Bars & Stats Card with Icons
    const rx = 100;
    let cardY = y;
    const statCards = [
      { name: "ACCOMMODATION", val: b.accommodation, pct: percentages[0], color: [13, 148, 136], icon: "hotel" },
      { name: "MEALS & FOOD", val: b.food, pct: percentages[1], color: [217, 119, 6], icon: "clock" },
      { name: "ACTIVITIES", val: b.activities, pct: percentages[2], color: [79, 70, 229], icon: "calendar" },
      { name: "LOCAL TRANSPORT", val: currencySym + localTransVal.toLocaleString(), pct: percentages[3], color: [2, 132, 199], icon: "mapPin" },
      { name: "VISA / INSURANCE", val: currencySym + visaInsuranceVal.toLocaleString(), pct: percentages[4], color: [5, 150, 105], icon: "mapPin" },
      { name: "MISCELLANEOUS", val: currencySym + miscVal.toLocaleString(), pct: percentages[5], color: [100, 116, 139], icon: "mapPin" },
      { name: "FLIGHTS", val: currencySym + flightVal.toLocaleString(), pct: percentages[6], color: [124, 58, 237], icon: "mapPin" }
    ];

    statCards.forEach((sc) => {
      drawPremiumCard(doc, rx, cardY, 95, 15, 1.5, 1.5, sc.color);

      // Draw semantic card icon on the left of each stat card
      if (sc.icon === "hotel") drawHotelIcon(doc, rx + 6, cardY + 7.5, sc.color);
      else if (sc.icon === "clock") drawClockIcon(doc, rx + 6, cardY + 7.0, sc.color);
      else if (sc.icon === "calendar") drawCalendarIcon(doc, rx + 6, cardY + 7.5, sc.color);
      else if (sc.icon === "mapPin") drawMapPinIcon(doc, rx + 6, cardY + 7.5, sc.color);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(sc.name, rx + 13, cardY + 4.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(sc.val ? String(sc.val) : "Est", rx + 13, cardY + 11);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(sc.color[0], sc.color[1], sc.color[2]);
      doc.text(`${sc.pct}%`, rx + 91, cardY + 4.5, { align: "right" });

      // Progress bar track (indented for icon)
      const barX = rx + 48;
      const barY = cardY + 9.5;
      const barW = 43;
      
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(barX, barY, barW, 1.8, 0.8, 0.8, "F");

      if (sc.pct > 0) {
        doc.setFillColor(sc.color[0], sc.color[1], sc.color[2]);
        doc.roundedRect(barX, barY, barW * (sc.pct / 100), 1.8, 0.8, 0.8, "F");
      }

      cardY += 18;
    });

    y = Math.max(ly + 28, cardY + 4);

    const invoiceData = itinerary.detailedBudgetSummary || {
      accommodationTotal: b.accommodation || (currencySym + "15,000"),
      foodTotal: b.food || (currencySym + "8,000"),
      localTransportTotal: b.transport || (currencySym + "3,500"),
      attractionTotal: b.activities || (currencySym + "2,000"),
      miscellaneousExpenses: b.miscellaneous || "N/A",
      originToDestinationCost: b.originToDestinationTravel || (itinerary.origin ? (currencySym + "6,000 - " + currencySym + "12,000") : "N/A"),
      visaAndInsurance: (b as any).visaAndInsurance || "N/A",
      grandTotal: b.total || (currencySym + "30,000")
    };

    const hasTransitCost = itinerary.origin && invoiceData.originToDestinationCost && invoiceData.originToDestinationCost !== "N/A" && parseVal(invoiceData.originToDestinationCost) > 0;
    const hasMiscCost = invoiceData.miscellaneousExpenses && invoiceData.miscellaneousExpenses !== "N/A" && parseVal(invoiceData.miscellaneousExpenses) > 0;
    const hasVisaInsurance = (invoiceData as any).visaAndInsurance && (invoiceData as any).visaAndInsurance !== "N/A" && parseVal((invoiceData as any).visaAndInsurance) > 0;

    const aiSafetyBufferValue = (itinerary as any).isAiBudgetPlanner
      ? Math.max(0, parseVal((itinerary as any).plannedBudget || itinerary.budgetAmount) - parseVal(invoiceData.grandTotal || b.total))
      : 0;
    const aiSafetyBufferText = aiSafetyBufferValue > 0 ? `${currencySym}${Math.round(aiSafetyBufferValue).toLocaleString()}` : "N/A";

    const categories = [
      { label: "Accommodations Cumulative Ratios", val: invoiceData.accommodationTotal },
      { label: "Food & Dining Allowances", val: invoiceData.foodTotal },
      { label: "Transit & Vehicle Rentals", val: invoiceData.localTransportTotal },
      { label: "Activities & Experiences", val: invoiceData.attractionTotal },
      ...(hasTransitCost ? [{ label: `Travel Transit from ${itinerary.origin}`, val: invoiceData.originToDestinationCost }] : []),
      ...(hasVisaInsurance ? [{ label: "Visa & Travel Insurance", val: (invoiceData as any).visaAndInsurance }] : []),
      ...(hasMiscCost ? [{ label: "Miscellaneous & Contingency", val: invoiceData.miscellaneousExpenses }] : []),
      ...(aiSafetyBufferValue > 0 ? [{ label: "Recommended Safety Buffer", val: aiSafetyBufferText }] : [])
    ];

    const flightSourceNote = itinerary.flightEstimateSource === "travelpayouts-aviasales-cache"
      ? `Airfare source: recent cached Aviasales fare${itinerary.flightEstimateMethod ? ` (${itinerary.flightEstimateMethod})` : ""}. Not a guaranteed live booking price.`
      : itinerary.flightEstimateSource === "route-model-fallback"
        ? "Airfare source: planning estimate because a usable recent fare was unavailable for the selected dates."
        : "";
    const tableHeight = 12 + (categories.length * 4.8) + (flightSourceNote ? 7 : 0);

    // Consolidated Invoicing details table
    checkPageEnd(tableHeight + 10);
    // Draw table background - dynamically adjusted height
    drawPremiumCard(doc, marginX, y, 180, tableHeight, 2, 2, [148, 163, 184], [248, 250, 252]);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("Cost Category", marginX + 6, y + 6);
    doc.text("Allocated Capital Sum", 190, y + 6, { align: "right" });

    // Divider line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX + 4, y + 8, marginX + 176, y + 8);

    categories.forEach((cat, idx) => {
      const cy = y + 13 + (idx * 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(cat.label, marginX + 6, cy);
      doc.text(String(cat.val), 190, cy, { align: "right" });
    });
    if (flightSourceNote) {
      const noteY = y + 15 + (categories.length * 4.5);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(doc.splitTextToSize(flightSourceNote, 166), marginX + 6, noteY);
    }

    y += tableHeight + 5;

    // Highlighted Grand Total Card (Enlarged and Luxury Styled)
    drawPremiumCard(doc, marginX, y, 180, 15, 1.5, 1.5, [13, 148, 136], [240, 253, 250]);
    drawDollarIcon(doc, marginX + 6, y + 7.5, [13, 148, 136]);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(13, 148, 136);
    doc.text((itinerary as any).isAiBudgetPlanner ? "AI RECOMMENDED SAFE BUDGET" : "ESTIMATED GRAND INVESTMENT TOTAL", marginX + 11, y + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    const invoiceGrandDisplay = (itinerary as any).isAiBudgetPlanner
      ? ((itinerary as any).plannedBudget || itinerary.budgetAmount || invoiceData.grandTotal || b.total)
      : (invoiceData.grandTotal || b.total);
    doc.text(String(invoiceGrandDisplay), 190, y + 9.5, { align: "right" });

    y += 21;
  }

  // ==========================================
  // PAGE: SMART PACKING CHECKLIST
  // ==========================================
  const hasPacking = itinerary.packingChecklist && itinerary.packingChecklist.length > 0;
  if (hasPacking) {
    startSectionPage("06", "SMART CHECKLIST & PACKING REGISTRY", "Your essential checklist parameters synced directly with live travel checkpoints.");

    const categories = ["Clothing", "Electronics", "Documents", "Health", "Miscellaneous"];
    const grouped: Record<string, string[]> = {
      Clothing: [],
      Electronics: [],
      Documents: [],
      Health: [],
      Miscellaneous: []
    };

    itinerary.packingChecklist.forEach((item) => {
      const cat = getPackingCategory(item);
      grouped[cat].push(item);
    });

    const catIcons: Record<string, string> = {
      Clothing: "CLOTHING & APPAREL REGISTRY",
      Electronics: "ELECTRONICS & GEAR SPECIFICATIONS",
      Documents: "TRAVEL DOCUMENTS & SECURE IDENTITIES",
      Health: "HYGIENE, WELLNESS & MEDICAL APPARATUS",
      Miscellaneous: "MISCELLANEOUS ESSENTIAL COMPLEMENTS"
    };

    categories.forEach((cat) => {
      const items = grouped[cat];
      if (items.length === 0) return;

      checkPageEnd(18);
      // Category banner
      drawPremiumCard(doc, marginX, y, 180, 7, 1.2, 1.2, [13, 148, 136], [240, 253, 250]);
      doc.setFillColor(13, 148, 136);
      doc.rect(marginX + 4, y + 2, 1.2, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(13, 148, 136);
      doc.text(catIcons[cat] || cat.toUpperCase(), marginX + 8, y + 4.8);
      y += 11;

      let leftCol = true;
      const colW = 86;
      let leftY = y;
      let rightY = y;

      items.forEach((item) => {
        const isChecked = !!packingChecks[item];
        const itemX = leftCol ? marginX : marginX + colW + 8;
        const itemY = leftCol ? leftY : rightY;

        if (itemY + 12 > 268) {
          doc.addPage();
          leftY = 25;
          rightY = 25;
          
          // Continued Category banner
          drawPremiumCard(doc, marginX, 25, 180, 7, 1.2, 1.2, [13, 148, 136], [240, 253, 250]);
          doc.setFillColor(13, 148, 136);
          doc.rect(marginX + 4, 27, 1.2, 3, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(13, 148, 136);
          doc.text(`${catIcons[cat] || cat.toUpperCase()} (CONTINUED)`, marginX + 8, 29.8);
          leftY = 36;
          rightY = 36;
        }

        const currentItemX = leftCol ? marginX : marginX + colW + 8;
        const currentItemY = leftCol ? leftY : rightY;

        drawPremiumCard(doc, currentItemX, currentItemY, colW, 9, 1.2, 1.2, isChecked ? [13, 148, 136] : [148, 163, 184]);

        if (isChecked) {
          drawCheckIcon(doc, currentItemX + 5, currentItemY + 4.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(13, 148, 136);
        } else {
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.35);
          doc.roundedRect(currentItemX + 3.4, currentItemY + 2.7, 3.6, 3.6, 0.8, 0.8, "D");
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
        }

        doc.setFontSize(8);
        doc.text(item, currentItemX + 11, currentItemY + 5.5);

        if (leftCol) leftY += 12;
        else rightY += 12;
        leftCol = !leftCol;
      });

      y = Math.max(leftY, rightY) + 4;
    });
  }

  // ==========================================
  // PAGE: TRAVEL ADVISORY & COMPANION PASS
  // ==========================================
  startSectionPage("07", "TRAVEL ADVISORY & LOCAL INSIGHTS", "Essential destination security advisory and practical local guidance.");

  const hasTips = itinerary.travelTips && itinerary.travelTips.length > 0;
  if (hasTips) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Professional Destination Advisory Tips", marginX, y);
    y += 8;

    itinerary.travelTips.slice(0, 8).forEach((tip) => {
      const isWarning = tip.toLowerCase().includes("warning") || tip.toLowerCase().includes("avoid") || tip.toLowerCase().includes("caution") || tip.toLowerCase().includes("scam");
      const isSafety = tip.toLowerCase().includes("police") || tip.toLowerCase().includes("safety") || tip.toLowerCase().includes("emergency") || tip.toLowerCase().includes("lock") || tip.toLowerCase().includes("night");
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const tipLines = doc.splitTextToSize(tip, 160);
      const cardH = 14 + (tipLines.length * 4); // extra height for card header
      checkPageEnd(cardH + 4);

      if (isWarning) {
        // Warning: Amber
        drawPremiumCard(doc, marginX, y, 180, cardH, 1.5, 1.5, [217, 119, 6], [254, 243, 199]);
        drawWarningIcon(doc, marginX + 6, y + 6);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(180, 83, 9);
        doc.text("WARNING & CAUTIONARY ADVISORY", marginX + 13, y + 5.5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 53, 4);
        doc.text(tipLines, marginX + 13, y + 10.5);
      } else if (isSafety) {
        // Safety: Red
        drawPremiumCard(doc, marginX, y, 180, cardH, 1.5, 1.5, [239, 68, 68], [254, 242, 242]);
        drawShieldIcon(doc, marginX + 6, y + 6, [239, 68, 68]);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(153, 27, 27);
        doc.text("SECURITY & SAFETY ADVISORY", marginX + 13, y + 5.5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(153, 27, 27);
        doc.text(tipLines, marginX + 13, y + 10.5);
      } else {
        // Tip: Teal
        drawPremiumCard(doc, marginX, y, 180, cardH, 1.5, 1.5, [13, 148, 136], [240, 253, 250]);
        drawLightBulbIcon(doc, marginX + 6, y + 6, [13, 148, 136]);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(13, 148, 136);
        doc.text("SMART LOCAL INSIGHTS & CULTURAL TIPS", marginX + 13, y + 5.5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(15, 118, 110);
        doc.text(tipLines, marginX + 13, y + 10.5);
      }

      y += cardH + 4.5;
    });
    y += 4;
  }

  if (itinerary.privateNote) {
    checkPageEnd(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text("Personal Trip Log Memories", marginX, y);
    y += 6;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    const noteLines = doc.splitTextToSize(`"${itinerary.privateNote}"`, 170);
    const boxH = 8 + noteLines.length * 4.2;
    drawPremiumCard(doc, marginX, y, 180, boxH, 2, 2, [217, 119, 6], [254, 253, 250]);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(noteLines, marginX + 5, y + 5.5);
    y += boxH + 8;
  }

  // ==========================================
  // PAGE: DIGITAL COMPANION TICKET PASS (Dedicated QR Page)
  // ==========================================
  startSectionPage("08", "DIGITAL COMPANION & OFFLINE PORTAL", "Live interactive tools, dynamic mapping guides, and offline companion features.");

  // Dark luxurious background block (Enlarged)
  drawPremiumCard(doc, marginX, y, 180, 162, 3, 3, [20, 184, 166], [15, 23, 42]);

  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.15);
  doc.circle(marginX + 90, y + 81, 58, "D");
  doc.circle(marginX + 90, y + 81, 48, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 184, 166);
  doc.text("OPEN YOUR LIVE AI TRAVEL COMPANION", marginX + 90, y + 15, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Scan to access your live TripBalancing travel companion.", marginX + 90, y + 21, { align: "center" });

  // QR Code (Enlarged to 64)
  const qrSize = 64;
  const qrx = marginX + 90 - qrSize / 2;
  const qry = y + 27;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrx - 3, qry - 3, qrSize + 6, qrSize + 6, 2.5, 2.5, "F");

  const finalCompQr = qrCodes[1] || null;
  if (finalCompQr) {
    try {
      doc.addImage(finalCompQr, "PNG", qrx, qry, qrSize, qrSize);
    } catch (e) {
      drawFallbackQRCode(doc, qrx, qry, qrSize);
    }
  } else {
    drawFallbackQRCode(doc, qrx, qry, qrSize);
  }

  // Draw official TripBalancing logo in the exact center of the QR code
  const qrcx = qrx + qrSize / 2;
  const qrcy = qry + qrSize / 2;
  doc.setFillColor(255, 255, 255);
  doc.circle(qrcx, qrcy, 5.5, "F");
  drawTripBalancingLogo(doc, qrcx - 1.1, qrcy + 0.6, false, 0.16);

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(marginX + 15, y + 96, marginX + 165, y + 96);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("INCLUDED SMART FEATURES", marginX + 90, y + 101, { align: "center" });

  const features = [
    { title: "LIVE MAPS", desc: "Interactive path navigation and geolocated pins.", type: "maps" },
    { title: "OFFLINE ACCESS", desc: "No internet required to browse your full itinerary.", type: "offline" },
    { title: "SPLIT EXPENSES", desc: "Share bill ledger tallies instantly with travel buddies.", type: "expenses" },
    { title: "WEATHER FORECAST", desc: "Live dynamic meteorological forecasts per city stop.", type: "weather" },
    { title: "CURRENCY CONVERTER", desc: "Automated standard currency exchange conversion tables.", type: "currency" },
    { title: "PACKING CHECKLIST", desc: "Active checklist parameters synchronizing with buddies.", type: "packing" }
  ];

  features.forEach((feat, idx) => {
    const colIdx = idx % 2;
    const rowIdx = Math.floor(idx / 2);
    const fx = colIdx === 0 ? marginX + 6 : marginX + 92;
    const fy = y + 106 + (rowIdx * 15);

    // Feature card block
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(30, 58, 64);
    doc.setLineWidth(0.25);
    doc.roundedRect(fx, fy, 82, 13, 1.2, 1.2, "FD");

    // Draw the custom high-quality vector icon based on the feature type (centered inside card)
    if (feat.type === "maps") {
      drawMapPinIcon(doc, fx + 5, fy + 6.5, [20, 184, 166]);
    } else if (feat.type === "offline") {
      doc.setDrawColor(20, 184, 166);
      doc.setLineWidth(0.35);
      doc.circle(fx + 5, fy + 6.5, 1.8, "D");
      doc.setLineWidth(0.25);
      doc.line(fx + 4.2, fy + 6.5, fx + 4.8, fy + 7.1);
      doc.line(fx + 4.8, fy + 7.1, fx + 5.8, fy + 5.9);
    } else if (feat.type === "expenses") {
      drawDollarIcon(doc, fx + 5, fy + 6.5, [20, 184, 166]);
    } else if (feat.type === "weather") {
      drawWeatherIcon(doc, fx + 5, fy + 6.5, [20, 184, 166]);
    } else if (feat.type === "currency") {
      doc.setFillColor(20, 184, 166);
      doc.circle(fx + 4.2, fy + 7.1, 1.1, "F");
      doc.setFillColor(45, 212, 191);
      doc.circle(fx + 6, fy + 6.1, 1.1, "F");
    } else if (feat.type === "packing") {
      doc.setDrawColor(20, 184, 166);
      doc.setLineWidth(0.3);
      doc.rect(fx + 3.5, fy + 5.0, 3, 3, "D");
      doc.line(fx + 4.2, fy + 6.6, fx + 4.8, fy + 7.2);
      doc.line(fx + 4.8, fy + 7.2, fx + 5.8, fy + 6.0);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(20, 184, 166);
    doc.text(feat.title, fx + 10, fy + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(feat.desc, fx + 10, fy + 9.2);
  });

  drawTripBalancingLogo(doc, marginX + 38, y + 155, true, 0.32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("POWERED BY TRIPBALANCING COMPANION ENGINE", marginX + 43, y + 155.8);

  // ==========================================
  // RUNNING HEADERS & FOOTERS (POST-PROCESSING)
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (i === 1) {
      // Cover has its own footer; do not add the legacy footer again.
      continue;
    }

    const isSectionStart = !!sectionStartPages[i];

    if (!isSectionStart) {
      // Header line (compatible with both A4 and Letter)
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginX, 14.2, 195, 14.2);

      // Left: Destination
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(String(itinerary.destination || "Trip").toUpperCase(), marginX, 10.5);

      // Right: Section Name
      const secName = pageSectionNames[i] || "TRAVEL GUIDE BOOK";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(secName.toUpperCase(), 195, 10.5, { align: "right" });

      // Center horizontally: Small clean side-by-side branding (Logo + TRIPBALANCING)
      // This horizontal arrangement prevents overlap and remains extremely clean.
      drawTripBalancingLogo(doc, 93, 9.7, false, 0.32);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(13, 148, 136);
      drawSpacedText(doc, "TRIPBALANCING", 95.8, 10.5, 0.2, "left");
    }

    // Footer line (Reduced height, fully visible on both A4 and Letter)
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, 280, 195, 280);

    // Left: Logo + Destination
    drawTripBalancingLogo(doc, marginX + 1, 282.8, false, 0.25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(String(itinerary.destination || "Trip").toUpperCase(), marginX + 4.5, 283.9);

    // Center: Generation Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${todayStr}`, 105, 283.9, { align: "center" });

    // Right: Page Number
    doc.setFillColor(13, 148, 136);
    doc.circle(192, 282.9, 1.8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i), 192, 283.6, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Page", 185, 283.9);
  }

  doc.save(`TripBalancing_${itinerary.destination.replace(/[^a-zA-Z0-9]/g, "_")}_Premium_Guide.pdf`);
};
