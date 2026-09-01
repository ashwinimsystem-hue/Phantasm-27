/**
 * PHANTASM'27 — registration source patch
 * ---------------------------------------
 * Auditable, replayable patch for the shipped Vite bundle
 * (public/assets/index-BVThDX27.js):
 *
 *   1. drops the gender-based fee waiver — one standard fee per event for everyone
 *   2. drops the skip-payment branch that posted a synthetic `FREE-<ts>` UTR
 *   3. drops every FREE / struck-through price presentation (event cards + success page)
 *   4. drops the "Register for Free" submit label (the CTA now reads
 *      "Pay & Register ₹N", or a plain "Register" while nothing is selected)
 *   5. rebuilds the registration markup as labelled sections so the page can be
 *      styled like the approved sample (index (2).html + style.css)
 *
 * Run:  node tools/patch-registration.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'public/assets/index-BVThDX27.js');
let src = readFileSync(file, 'utf8');
const before = src;

if (src.includes('reg-field-label')) {
  console.log('bundle already patched — nothing to do');
  process.exit(0);
}

/**
 * Replace src[a:b) where a = index(start) and b = index(end) after a.
 * The `end` anchor itself is NOT consumed, so `replacement` must not repeat it.
 */
function region(label, start, end, replacement) {
  const a = src.indexOf(start);
  if (a === -1) throw new Error(`${label}: start anchor not found`);
  if (src.indexOf(start, a + 1) !== -1) throw new Error(`${label}: start anchor not unique`);
  const b = end === null ? a + start.length : src.indexOf(end, a + start.length);
  if (b === -1) throw new Error(`${label}: end anchor not found`);
  if (b - a > 60000) throw new Error(`${label}: region implausibly large (${b - a} chars)`);
  src = src.slice(0, a) + replacement + src.slice(b);
}

/* ══════════════════════════════════════════════════════════════════════
   1 · TOTAL: standard fee only, gender is never a pricing input
   ══════════════════════════════════════════════════════════════════════ */
region(
  'fee-waiver',
  `            let U = L.fee?.[Le.mode];
            O.gender === "Female" && Le.mode === "SOLO" && (L.category === "Technical" || L.category === "Workshop") && (U = 0), typeof U == "number" && (ue += U)`,
  null,
  `            const U = L.fee?.[Le.mode];
            typeof U == "number" && (ue += U)`
);

/* ══════════════════════════════════════════════════════════════════════
   2 · SUBMIT: always hand off to UPI payment (no zero-amount bypass)
   ══════════════════════════════════════════════════════════════════════ */
region(
  'free-submit-branch',
  `                    if (W === 0) try {`,
  `                    w("/payment", {`,
  ``
);

/* ══════════════════════════════════════════════════════════════════════
   3 · EVENT CARD: title + standard fee + mode picker (no FREE, no strike)
   ══════════════════════════════════════════════════════════════════════ */
region(
  'event-card',
  `Ne = ue => {`,
  `    return y.jsxs(Fs, {`,
  `Ne = ue => {
            const Le = O.selectedEvents.find(L => L.eventId === ue.id);
            return y.jsxs("div", {
                className: \`event-card reg-card\${Le ? " selected" : ""}\`,
                role: "button",
                tabIndex: 0,
                "aria-pressed": !!Le,
                onClick: () => ce(ue),
                onKeyDown: L => {
                    (L.key === "Enter" || L.key === " ") && (L.preventDefault(), ce(ue))
                },
                children: [y.jsxs("div", {
                    className: "reg-card-head",
                    children: [y.jsx("h4", {
                        children: ue.title
                    }), y.jsx("span", {
                        className: "reg-card-state",
                        "aria-hidden": "true",
                        children: Le ? "Selected" : "Tap to select"
                    })]
                }), y.jsxs("p", {
                    className: "reg-card-fee",
                    children: ["Fee: ", ue.modes.length === 1 ? \`₹\${ue.fee?.[ue.modes[0]] ?? 0}\` : ue.modes.map((L, C) => y.jsxs("span", {
                        children: [L, " ₹", ue.fee?.[L] ?? 0, C < ue.modes.length - 1 ? "  ·  " : ""]
                    }, L))]
                }), Le && ue.modes.length > 1 && y.jsxs("select", {
                    className: "reg-card-mode",
                    "aria-label": "Participation mode",
                    value: Le.mode,
                    onClick: L => L.stopPropagation(),
                    onChange: L => pe(ue.id, L.target.value),
                    children: ue.modes.map(L => y.jsxs("option", {
                        value: L,
                        children: [L, " – ₹", ue.fee[L]]
                    }, L))
                })]
            }, ue.id)
        };
    const rf = (ue, Le, Ce) => y.jsxs("label", {
        className: \`reg-field\${Ce ? " " + Ce : ""}\`,
        children: [y.jsx("span", {
            className: "reg-field-label",
            children: ue
        }), Le]
    }, ue);
`
);

/* ══════════════════════════════════════════════════════════════════════
   4 · PAGE MARKUP: sample-style header + labelled form sections
   ══════════════════════════════════════════════════════════════════════ */
region(
  'page-body',
  `        }), y.jsxs("div", {
            className: "container section",
            children: [y.jsx("h1", {
                className: "Registertitle",`,
  `}, u6 = () => {`,
  `        }), y.jsxs("div", {
            className: "container section register-page",
            children: [y.jsxs("header", {
                className: "reg-head",
                children: [y.jsx("span", {
                    className: "reg-kicker",
                    children: "PHANTASM'27  ·  வாகை  ·  Vaagai 2k26"
                }), y.jsx("h1", {
                    className: "Registertitle",
                    children: "Register"
                }), y.jsx("span", {
                    className: "reg-rule",
                    "aria-hidden": "true"
                }), y.jsx("p", {
                    className: "reg-sub",
                    children: "Claim your place at the 13th National Level Technical Symposium — Department of Mechanical Engineering, GCE Bargur · 17 & 18 September 2026."
                }), y.jsxs("p", {
                    className: "already-team",
                    children: ["Already have a team?", " ", y.jsx("button", {
                        type: "button",
                        className: "reg-link",
                        onClick: t,
                        children: "Join here"
                    })]
                })]
            }), y.jsx("div", {
                className: "Formcontainer register-frame",
                children: y.jsxs("form", {
                    onSubmit: ue => ue.preventDefault(),
                    children: [y.jsxs("section", {
                        className: "reg-section",
                        children: [y.jsx("h2", {
                            className: "reg-section-title",
                            children: "Participant details"
                        }), y.jsxs("div", {
                            className: "reg-grid",
                            children: [rf("Full name", y.jsx("input", {
                                name: "name",
                                placeholder: "As printed in your college records",
                                required: !0,
                                value: O.name,
                                onChange: q
                            }), "reg-field-wide"), rf("Email", y.jsx("input", {
                                ref: v,
                                name: "email",
                                type: "email",
                                placeholder: "you@example.com",
                                required: !0,
                                className: f ? "reg-input-error" : "",
                                value: O.email,
                                onChange: ue => {
                                    q(ue), d("")
                                }
                            })), rf("Phone", y.jsx("input", {
                                name: "phone",
                                inputMode: "numeric",
                                placeholder: "10-digit number",
                                required: !0,
                                value: O.phone,
                                onChange: q
                            })), rf("College", y.jsx("input", {
                                name: "college",
                                placeholder: "College name",
                                required: !0,
                                value: O.college,
                                onChange: q
                            }), "reg-field-wide"), rf("Department", y.jsx("input", {
                                name: "dept",
                                placeholder: "Mechanical Engineering",
                                required: !0,
                                value: O.dept,
                                onChange: q
                            })), rf("Year of study", y.jsxs("select", {
                                name: "year",
                                value: O.year,
                                onChange: q,
                                children: [y.jsx("option", {
                                    value: "",
                                    children: "Select year"
                                }), y.jsx("option", {
                                    value: "1",
                                    children: "I Year"
                                }), y.jsx("option", {
                                    value: "2",
                                    children: "II Year"
                                }), y.jsx("option", {
                                    value: "3",
                                    children: "III Year"
                                }), y.jsx("option", {
                                    value: "4",
                                    children: "IV Year"
                                })]
                            })), rf("Gender", y.jsxs("select", {
                                name: "gender",
                                required: !0,
                                value: O.gender,
                                onChange: q,
                                children: [y.jsx("option", {
                                    value: "",
                                    children: "Select gender"
                                }), y.jsx("option", {
                                    value: "Male",
                                    children: "Male"
                                }), y.jsx("option", {
                                    value: "Female",
                                    children: "Female"
                                }), y.jsx("option", {
                                    value: "Other",
                                    children: "Other"
                                })]
                            }))]
                        }), f && y.jsx("p", {
                            className: "reg-error",
                            role: "alert",
                            children: f
                        })]
                    }), M && y.jsxs("section", {
                        className: "reg-section",
                        ref: P,
                        children: [y.jsx("h2", {
                            className: "reg-section-title",
                            children: "Team details"
                        }), y.jsxs("div", {
                            className: "reg-grid",
                            children: [rf("Team name", y.jsx("input", {
                                name: "teamName",
                                placeholder: "Enter your team name",
                                required: !0,
                                value: O.teamName,
                                onChange: q
                            }), "reg-field-wide")]
                        }), y.jsxs("p", {
                            className: "reg-hint",
                            children: ["ℹ️ Your unique ", y.jsx("b", {
                                children: "Team ID"
                            }), " for each event will be sent to your email immediately after registration."]
                        })]
                    }), y.jsxs("section", {
                        className: "reg-section",
                        children: [y.jsxs("div", {
                            className: "reg-events-head",
                            children: [y.jsx("h2", {
                                className: "reg-section-title",
                                children: "Select events"
                            }), y.jsxs("span", {
                                className: "reg-count",
                                children: [O.selectedEvents.length, " selected"]
                            })]
                        }), y.jsx("input", {
                            className: "reg-search",
                            type: "text",
                            placeholder: "Search events…",
                            "aria-label": "Search events",
                            value: x,
                            onChange: ue => E(ue.target.value)
                        }), y.jsx("div", {
                            className: "event-tabs-wrapper reg-tabs",
                            children: y.jsx("div", {
                                className: "reg-tabs-inner",
                                children: ["All", "Technical", "Non-Technical", "Workshop"].map(ue => y.jsx("button", {
                                    type: "button",
                                    className: o === ue ? "reg-tab active" : "reg-tab",
                                    onClick: () => c(ue),
                                    children: ue
                                }, ue))
                            })
                        }), Ue.length > 0 && y.jsxs(y.Fragment, {
                            children: [y.jsx("h3", {
                                className: "register-category-title",
                                children: "Technical Events"
                            }), y.jsx("div", {
                                className: "Registercards reg-cards",
                                children: Ue.map(ue => Ne(ue))
                            })]
                        }), J.length > 0 && y.jsxs(y.Fragment, {
                            children: [y.jsx("h3", {
                                className: "register-category-title",
                                children: "Non-Technical Events"
                            }), y.jsx("div", {
                                className: "Registercardsnon reg-cards",
                                children: J.map(ue => Ne(ue))
                            })]
                        }), ye.length > 0 && y.jsxs(y.Fragment, {
                            children: [y.jsx("h3", {
                                className: "register-category-title",
                                children: "Workshops"
                            }), y.jsx("div", {
                                className: "Registercards reg-cards",
                                children: ye.map(ue => Ne(ue))
                            })]
                        }), y.jsx("p", {
                            className: "reg-hint",
                            children: "ℹ️ Want to participate in more events later? You can add events by contacting the event coordinators."
                        })]
                    }), y.jsxs("section", {
                        className: "reg-summary",
                        children: [y.jsxs("p", {
                            className: "reg-summary-note",
                            children: [y.jsx("b", {
                                children: "One standard fee"
                            }), " per event — identical for every participant. Payment is completed by UPI on the next step."]
                        }), y.jsxs("p", {
                            className: "reg-total",
                            children: [y.jsx("span", {
                                children: "Total amount payable"
                            }), y.jsxs("b", {
                                children: ["₹", W]
                            })]
                        }), y.jsx("button", {
                            type: "button",
                            className: "btn reg-submit",
                            onClick: we,
                            disabled: !oe || r,
                            children: r ? "Processing..." : W ? \`Pay & Register ₹\${W}\` : "Register" 
                        })]
                    })]
                })
            })]
        })]
    })
`
);

/* ══════════════════════════════════════════════════════════════════════
   5 · SUCCESS PAGE: amount is always a rupee figure
   ══════════════════════════════════════════════════════════════════════ */
region(
  'success-amount',
  `                            children: f === 0 ? y.jsx("span", {
                                style: {
                                    color: "#00ff88",
                                    fontWeight: "bold"
                                },
                                children: "FREE"
                            }) : \`₹\${f}\``,
  null,
  `                            children: \`₹\${f}\``
);

/* ══════════════════════════════════════════════════════════════════════
   sanity checks
   ══════════════════════════════════════════════════════════════════════ */
const guards = [
  [/\bFREE\b(?!-)/, 'a FREE literal is still present'],
  [/Register for Free/, 'the "Register for Free" label is still present'],
  [/O\.gender === "Female"/, 'a gender-based pricing condition is still present'],
  [/FREE-\$\{Date\.now\(\)\}/, 'the synthetic FREE UTR is still present'],
];
for (const [re, msg] of guards) {
  if (re.test(src)) throw new Error(`guard failed: ${msg}`);
}
/* Structural validation is delegated to the engine: run
   `node --check public/assets/index-BVThDX27.js` right after this script. */
writeFileSync(file, src);
console.log(`✓ patched ${src.length - before.length >= 0 ? '+' : ''}${src.length - before.length} bytes → public/assets/index-BVThDX27.js`);
