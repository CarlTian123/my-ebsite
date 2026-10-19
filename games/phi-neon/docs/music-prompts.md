# PHI:NEON — 五首曲目生成提示词（给 Gemini / Lyria 用）

> 目标：让生成模型产出**能被现有谱面直接使用**的音频。谱面是按 BPM 精确对齐的，所以提示词里最硬的三条是：**恒定 BPM、恰好 90 秒、纯器乐**。

## 0. 先贴这段「总规则」

```
Instrumental music for a rhythm game. For every track: exactly 90 seconds long,
constant tempo with no drift or rubato, 4/4, instrumental only (no vocals, no
lyrics, no vocal chops that read as words), no quotation of existing songs, no
recognizable copyrighted melodies. Stereo mix, club-ready but not over-limited:
integrated loudness around -14 LUFS, true peak at or below -1 dBFS. Give each
section a clear downbeat accent (impact) so the game can sync visual effects.
End with a musical tail that decays into silence within the last 1.5 seconds.
```

如果模型支持单独填「负面提示词」，统一用：

```
vocals, lyrics, human voice, choir, spoken word, tempo change, rubato, sudden
silence, hard cut ending, clipping, distortion overload, white-noise wash,
recognizable existing song, lo-fi phone recording
```

## 1. NEON PULSE — Drum & Bass / 霓虹合成器 · 176 BPM · A 小调

结构（秒）：
| 段落 | 时间 | 说明 |
|---|---|---|
| intro | 0:00–0:08 | 滤波 Pad 渐起、远处雨声、一记低频 |
| build | 0:08–0:22 | two-step 鼓组进入、噪声上扬、Reese 贝斯打开 |
| drop 1 | 0:22–0:44 | 全编制 liquid DnB |
| break | 0:44–0:55 | 撤鼓、反向镲、玻璃 Pad + 滤波 Lead |
| drop 2 | 0:55–1:16 | 加打击乐、八度跳进 Lead、更大混响 |
| outro | 1:16–1:30 | 鼓组收薄、Pad 长音、最后一记 sub 收尾 |

```
Liquid drum & bass, 176 BPM, A minor, exactly 90 seconds, constant tempo.
Mood: midnight city after rain, magenta and cyan neon reflecting on wet asphalt.
Intro 0:00-0:08: filtered pad swell, distant rain texture, one deep sub hit.
Build 0:08-0:22: two-step breakbeat enters with shuffling 16th hi-hats, rising
noise sweep, Reese bass slowly opening.
Drop 1 0:22-0:44: full liquid roller - tight kick-snare two-step, deep Reese
sub, wide detuned supersaw chords, bright plucked arpeggio answering the chords
every two bars, sidechained pads.
Break 0:44-0:55: drums drop out, reverse cymbal, glassy pad and filtered lead,
riser building tension.
Drop 2 0:55-1:16: same groove plus extra percussion, octave-jumping lead, bigger
reverb tail.
Outro 1:16-1:30: drums thin out, pad sustains, final sub hit, tail decays.
Mix: tight punchy low end, airy top, mono-compatible bass, no clipping.
```

避免：`dubstep wobble, pop vocals, tempo change, long silence`

## 2. FROSTLIGHT — Melodic Future Bass / 冰晶氛围 · 144 BPM · D 小调

结构（秒）：
| 段落 | 时间 | 说明 |
|---|---|---|
| intro | 0:00–0:13 | 铃状 Pluck、冷空气 Pad、风的噪声 |
| build | 0:13–0:27 | Supersaw 和弦铺开、军鼓滚奏、上扬 Riser |
| drop 1 | 0:27–0:50 | Future Bass 主体、大和弦与 sub |
| break | 0:50–1:03 | 只留 Pluck 与弦乐、宽混响 |
| drop 2 | 1:03–1:23 | 加八度 Lead 与闪烁琶音 |
| outro | 1:23–1:30 | Pad 与铃音淡出 |

```
Melodic future bass, 144 BPM, D minor, exactly 90 seconds, constant tempo.
Mood: frozen lake at dawn, ice crystals catching pale blue light, quiet and wide.
Intro 0:00-0:13: bell-like plucks, airy evolving pad, soft filtered wind noise.
Build 0:13-0:27: supersaw chords swell, snare rolls, pitch-rising riser, sub
bass enters.
Drop 1 0:27-0:50: future bass groove with big detuned supersaw chords, sub
bass, chime melody, half-time feel in the drums, sidechained pad.
Break 0:50-1:03: drums out, felt piano plucks and warm string pad, very wide
reverb.
Drop 2 1:03-1:23: fuller reprise, octave lead over the chords, shimmering
arpeggio, extra percussion.
Outro 1:23-1:30: pads and bells fade, last chord rings out.
Mix: soft top end, deep but clean sub, lots of stereo width, no harshness.
```

避免：`edm festival drop, vocals, trap hi-hat rolls, tempo change`

## 3. ION RUSH — Hardcore / Speedcore / 反应堆过载 · 200 BPM · F# 小调

结构（秒）：
| 段落 | 时间 | 说明 |
|---|---|---|
| intro | 0:00–0:10 | 警报、工业噪声、失真 Kick 试探 |
| build | 0:10–0:19 | 四拍 Kick + Acid 16 分、Hoover 警报 |
| drop 1 | 0:19–0:41 | 全速硬核：失真 Kick、Gated Snare |
| break | 0:41–0:50 | 半速、滤波、只剩呼吸声与警报 |
| drop 2 | 0:50–1:19 | 双倍镲片、Hoover 反拍、高音应答 |
| outro | 1:19–1:30 | 元素逐个撤走、最后一记 Kick 收尾 |

```
Industrial hardcore / speedcore, 200 BPM, F# minor, exactly 90 seconds, constant
tempo. Mood: reactor core overloading, red emergency lights, steam and sparks.
Intro 0:00-0:10: alarm-like siren, industrial noise bed, distorted kick
testing the downbeat.
Build 0:10-0:19: relentless four-on-the-floor distorted kick, acid 16th-note
bassline, hoover siren stabs.
Drop 1 0:19-0:41: full-speed hardcore - distorted kick, gated snare, metallic
percussion, hoover stabs on the offbeats, aggressive acid bass.
Break 0:41-0:50: half-time, filtered, breathing room with siren and steam,
tension riser.
Drop 2 0:50-1:19: double-time hats, hoover stabs, high counter-melody, denser
drums, bigger impacts.
Outro 1:19-1:30: elements drop out one by one, final kick and distorted tail.
Mix: very loud and dense but still separated, punchy transients, controlled
high end, no clipping.
```

避免：`melodic trance, vocals, shuffle groove, tempo change`

## 4. VELVET STATIC — Lo-fi Jazz-hop / 磁带黄昏 · 88 BPM · Eb 大调

结构（秒）：
| 段落 | 时间 | 说明 |
|---|---|---|
| intro | 0:00–0:11 | 黑胶底噪、Rhodes 和弦、鼓刷 |
| build | 0:11–0:22 | 行走贝斯、轻 Swing、弱音小号进入 |
| drop 1 | 0:22–0:44 | 完整 Lo-fi 律动 |
| break | 0:44–0:55 | 只留 Rhodes 与黑胶、稀疏鼓刷 |
| drop 2 | 0:55–1:19 | 高八度应答句、更满的鼓 |
| outro | 1:19–1:30 | 乐器逐个退场、磁带底噪收尾 |

```
Dusty lo-fi jazz-hop, 88 BPM, Eb major, exactly 90 seconds, constant tempo,
swung 16th notes. Mood: sunset through half-closed blinds, warm tape hiss, an
empty apartment.
Intro 0:00-0:11: vinyl crackle bed, warm Rhodes chords (3rd, 5th, 7th, 9th -
no bass root), brush drums.
Build 0:11-0:22: upright bass walking with chromatic approach notes, light
swing, muted trumpet melody enters.
Drop 1 0:22-0:44: full lo-fi groove - soft kick, brushed snare with ghost notes,
Rhodes comping, muted trumpet lead, subtle tape wobble.
Break 0:44-0:55: drums thin out, Rhodes and vinyl only, sparse brushes.
Drop 2 0:55-1:19: reprise with a high-octave answer phrase on muted trumpet,
fuller drums, warmer bass.
Outro 1:19-1:30: instruments leave one by one, vinyl noise and a final Rhodes
chord fade out.
Mix: warm, slightly rolled-off highs, intimate and quiet, mono-compatible bass.
```

避免：`loud edm, autotune vocals, harsh cymbals, tempo change`

## 5. GLASS TIDE — Ambient / IDM / 深水玻璃回声 · 112 BPM · C# 小调

结构（秒）：
| 段落 | 时间 | 说明 |
|---|---|---|
| intro | 0:00–0:13 | 水下 Pad、气泡、玻璃球体共鸣 |
| build | 0:13–0:30 | 琶音渐密、低频涌动、节拍若隐若现 |
| drop 1 | 0:30–0:56 | 半速鼓组 + 玻璃琶音 |
| break | 0:56–1:09 | 撤鼓、只剩水声与玻璃 |
| drop 2 | 1:09–1:21 | 玻璃音型与 Sub 涌动 |
| outro | 1:21–1:30 | 全部溶进混响 |

```
Underwater ambient / IDM, 112 BPM, C# minor, exactly 90 seconds, constant tempo.
Mood: deep water at night, light refracting through glass, distant sonar.
Intro 0:00-0:13: cavernous pad, glass bells with long decay, bubbling granular
texture, soft tape hiss, almost no drums.
Build 0:13-0:30: glass arpeggio grows, low sub swell, muted half-time pulse
appears and disappears.
Drop 1 0:30-0:56: half-time drums with soft kick and rim clicks, glassy
arpeggio, wide detuned pads, sub bass pulses.
Break 0:56-1:09: drums vanish, only water texture, glass resonance and pad.
Drop 2 1:09-1:21: glass ostinato returns with sub swells and a slow melodic
line, still restrained.
Outro 1:21-1:30: everything dissolves into reverb and tape hiss.
Mix: very wide and deep, soft transients, no harsh high end, mono-compatible
low end.
```

避免：`four-on-the-floor, pop vocals, aggressive distortion, tempo change`

## 6. 模型只能出 30–60 秒时怎么办

Gemini/Lyria 类模型常常限长。按段落切，逐段生成，每段都带上同样的 BPM/调性/音色描述，并要求「从上一段的最后一小节继续」：

1. 先出 **drop 1**（信息量最大，确定音色与律动）；
2. 再出 **intro + build**，要求「same instruments, same BPM, sparser」；
3. 再出 **break + drop 2**，要求「same groove, add counter-melody」；
4. 最后出 **outro**，要求「same chord, thin out, decay to silence」。

拼接时按 BPM 对齐小节线（每小节 = 240 / BPM 秒），在段落边界做 20–40 ms 交叉淡化即可；`tools/` 里没有拼接脚本，需要的话我可以补一个 `tools/stitch.py`。

## 7. 交回来时我需要什么

- **wav 或 mp3**，48 kHz 更好，单曲 90.0 s（±50 ms 内）；
- **恒定 BPM**：如果生成结果有速度漂移，先告诉我，我用 `ffmpeg/atempo` 或 rubberband 做时间校正，再重新对齐谱面；
- 不要预先加淡出（最后 1.5 s 的自然衰减可以保留），不要做成「循环片段」；
- 如果只有 mp3，我会用 `afconvert` 转成 256 kbps m4a 并替换 `audio/*.m4a`，同时校验 `afinfo` 时长与波形峰值。

> 现有 numpy 合成版本仍保留在 `audio/` 里作为 fallback；替换后我会重跑一遍浏览器实测（5 首可播、时长 90 s、无解码错误、音符与音频时间轴对齐）。
