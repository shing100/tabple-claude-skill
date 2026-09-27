#!/usr/bin/env node
// 옛 CLI 이름의 진입점. 실제 CLI 는 같은 폴더의 tp.mjs 다 — 여기서는 그것을 그대로 실행한다.
//
// 지우지 말 것: 2026-05 ~ 09 에 배포된 Tabple Desktop 의 스킬 설치 버튼(src-tauri/src/skill.rs)은
// 받은 릴리스에 bin/tf.mjs 가 없으면 "필수 파일 누락" 으로 설치를 거절한다. 새 빌드는 bin/tp.mjs 를
// 보지만, 옛 빌드가 남아 있는 동안 이 파일이 그 설치를 지킨다 (계약: src/lib/api/skillPackage.test.ts).
import "./tp.mjs";
