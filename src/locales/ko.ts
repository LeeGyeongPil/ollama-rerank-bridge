import type { en } from "./en.js";

/** 한국어 메시지. 키 집합은 en.ts 와 같아야 한다(테스트가 확인). */
export const ko: Record<keyof typeof en, string> = {
  "banner.mock": "[연습용 목(mock) 모드: 실제 모델이 아니라 가짜 Ollama 가 답합니다]",

  "help.main": `ollama-rerank-bridge - 실행 중인 Ollama 위에 /v1/rerank 를 붙여 주는 도구

사용법:
  ollama-rerank-bridge serve  [옵션]       리랭크 서버 시작
  ollama-rerank-bridge doctor --model <m>  리랭크가 동작할지 미리 점검
  ollama-rerank-bridge eval   --model <m>  리랭크 전후 nDCG@k·MRR 측정

공통 옵션:
  --ollama <url>        Ollama 주소 (기본: OLLAMA_HOST 또는 127.0.0.1:11434)
  --lang en|ko          화면 언어 (또는 OLLAMA_RERANK_BRIDGE_LANG)
  --mock                내장 가짜 Ollama 사용 (연습 모드, 모델 불필요)
  --mock-scenario <s>   healthy | old-ollama | no-yesno | slow (--mock 과 함께)
  --version, --help

serve:
  --model <m>           요청에 model 이 없을 때 쓸 기본 모델
  --host <h> --port <n> 바인드 주소 (기본 127.0.0.1:8100)
  --alias <앱이름=모델> 앱이 보내는 모델 이름을 Ollama 모델로 매핑 (여러 번 가능)
  --scoring <m>         auto | logprobs | embedding (기본 auto)
  --fallback-embed <m>  logprobs 점수화가 실패할 때 쓸 임베딩 모델
  --concurrency <n>     Ollama 동시 호출 수 (기본 2)
  --timeout <초>        요청 전체 타임아웃 (기본 60)
  --max-chars <n>       문서를 n 글자로 자름 (기본 4000)
  --max-docs <n>        문서가 더 많은 요청은 거절 (기본 200)
  --instruction <문장>  리랭커 지시문
  --api-key <키>        Authorization: Bearer <키> 요구 (또는 OLLAMA_RERANK_BRIDGE_API_KEY)

doctor / eval:
  --model <m>           Ollama 의 리랭커(또는 임베딩) 모델 이름
  --embed <m>           비교할 임베딩 모델
  --data <파일>         평가 파일 (기본: 번들 examples/sample-eval.json)
  --k <n>               nDCG 절단 순위 (기본 3)
  --json                기계가 읽는 출력

종료 코드: 0 성공, 1 사용법 오류, 2 doctor 점검 실패, 3 Ollama 에 접속 불가`,

  "error.unknownCommand": '알 수 없는 명령 "{cmd}"; serve, doctor, eval 중에서 고르세요 (--help 참고)',
  "error.modelRequired": "--model 이 필요합니다. 가진 모델 목록은 ollama list 로 확인하세요",
  "error.badLang": '--lang 은 "en" 또는 "ko" 여야 합니다 (받은 값: "{value}")',
  "error.mockScenario": '--mock-scenario 는 {list} 중 하나여야 합니다 (받은 값: "{value}")',
  "error.generic": "오류: {message}",
  "error.notInt": '--{name} 은 1 이상의 정수여야 합니다 (받은 값: "{value}")',
  "error.badOllamaHost": 'Ollama 주소 "{value}" 가 올바르지 않습니다: 포트는 숫자여야 합니다 (예: 127.0.0.1:11434)',
  "error.badAlias": '--alias "{value}" 가 올바르지 않습니다: --alias 앱모델이름=ollama모델이름 형식으로 쓰세요',
  "error.badScoring": '--scoring 은 auto, logprobs, embedding 중 하나여야 합니다 (받은 값: "{value}")',
  "error.badPort": '--port 는 0~65535 여야 합니다 (받은 값: "{value}")',
  "error.unknownOption": "알 수 없는 옵션 {option} (--help 참고)",
  "error.optionValue": "옵션 {option} 에 올바른 값이 필요합니다 (--help 참고)",
  "error.badArgs": "명령줄이 올바르지 않습니다 (--help 참고)",
  "error.evalRead": '평가 파일 "{path}" 를 읽을 수 없습니다. --data <파일.json> 으로 지정하세요 (examples/sample-eval.json 참고)',
  "error.evalJson": '{path} 는 올바른 JSON 이 아닙니다 ({line}번째 줄 {column}번째 글자 근처). 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] (examples/sample-eval.json 참고)',
  "error.evalEmpty": '{path} 가 비어 있습니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}] (examples/sample-eval.json 참고)',
  "error.evalNotArray": '{source}: 비어 있지 않은 JSON 배열이어야 합니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}], docs 는 1차 검색 순서대로',
  "error.evalQuery": '{source}: {i}번 항목: "query" 는 비어 있지 않은 문자열이어야 합니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}], docs 는 1차 검색 순서대로',
  "error.evalDocs": '{source}: {i}번 항목: "docs" 는 비어 있지 않은 배열이어야 합니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}], docs 는 1차 검색 순서대로',
  "error.evalDoc": '{source}: {i}번 항목의 {j}번 문서: "text"(문자열)와 "rel"(0 이상의 숫자)이 필요합니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}], docs 는 1차 검색 순서대로',
  "error.evalNoRel": '{source}: {i}번 항목: rel > 0 인 문서가 하나 이상 있어야 합니다. 형식: [{"query": "...", "docs": [{"text": "...", "rel": 0}]}], docs 는 1차 검색 순서대로',
  "error.unreachable": 'Ollama({url})에 접속할 수 없습니다 ({reason}). "ollama serve" 가 실행 중인가요? 주소는 --ollama 또는 OLLAMA_HOST 로 바꿉니다',
  "error.noLogprobs": "Ollama 가 logprobs 를 돌려주지 않았습니다. logprobs 점수 계산에는 Ollama 0.12.11 이상이 필요합니다",
  "error.aborted": "요청이 중단되었습니다",
  "error.ollamaHttp": "Ollama {path} 가 HTTP {status} 를 돌려주었습니다: {body}",
  "error.ollamaNonJson": "Ollama {path} 의 응답이 JSON 이 아닙니다",
  "error.embedUnexpected": 'Ollama /api/embed 가 모델 "{model}" 에 대해 예상 밖의 결과를 돌려주었습니다',

  "serve.mockStarted": "연습용 가짜 Ollama 시작 {url} (모델: {rerank}, {embed})",
  "serve.listening": "리랭크 브리지 대기 중 http://{host}:{port}  ->  Ollama {ollama}",
  "serve.try": "써 보기 (새 터미널에서):",
  "serve.stop": "종료하려면 Ctrl+C.",
  "serve.exposed": "경고: {host} 에 바인드했습니다. 이 주소에 닿는 누구나 내 Ollama 를 쓸 수 있습니다. --api-key 를 설정하세요.",

  "doctor.title": "doctor: Ollama {url}, 모델 {model}",
  "doctor.col.n": "#",
  "doctor.col.check": "점검",
  "doctor.col.result": "결과",
  "doctor.col.details": "상세",
  "doctor.check.1": "Ollama 접속, 버전",
  "doctor.check.2": "모델 존재, 점수 방식",
  "doctor.check.3": "응답에 logprobs 포함",
  "doctor.check.4": "관련 문서 > 무관 문서 (영어, 한국어)",
  "doctor.check.5": "top-20 의 yes/no 토큰",
  "doctor.check.6": "지연 시간 예상",
  "doctor.skipped": "앞 점검이 실패해 건너뜀",
  "doctor.d.version": "버전 {version} (필요: {min} 이상)",
  "doctor.d.modelLogprobs": "family {family}, capabilities {caps} -> logprobs 점수화",
  "doctor.d.modelEmbedding": "family {family}, capabilities {caps} -> 임베딩 모델이라 코사인 점수화를 사용",
  "doctor.d.modelMissing": 'Ollama 에 "{model}" 모델이 없습니다',
  "doctor.d.notNeededEmbedding": "코사인 점수화에는 필요 없음",
  "doctor.d.noLogprobs": "logprobs 미지원 (Ollama 0.12.11 이상 필요)",
  "doctor.d.generateFailed": "호출 실패: {error}",
  "doctor.d.logprobsOk": "logprobs 있음 (첫 토큰: {first})",
  "doctor.d.direction": "관련 > 무관 점수: {scores}",
  "doctor.d.noYesNo": "{total}번 중 {n}번은 top-20 에 yes/no 토큰이 없음 (첫 토큰: {first})",
  "doctor.d.yesNo": "확인한 변형: {variants}; 소문자만 읽으면 {total}번 중 {blind}번은 못 봄",
  "doctor.d.latency": "쌍당 약 {ms}ms, 문서 20개 동시성 {c} = 약 {est}초 (타임아웃 {timeout}초)",
  "doctor.fix.version": "Ollama 를 0.12.11 이상으로 업데이트하세요 (https://ollama.com/download)",
  "doctor.fix.model": '먼저 모델을 가져오세요 ("ollama list" 로 확인). Qwen3-Reranker GGUF 는 FROM ./<파일>.gguf 와 TEMPLATE {{ .Prompt }} 가 든 Modelfile 로 만듭니다',
  "doctor.fix.generate": "Ollama 에서 모델이 로드되는지(ollama run <모델>) 확인하고 Ollama 서버 로그를 보세요",
  "doctor.fix.direction": "이 모델은 리랭커처럼 동작하지 않습니다. Qwen3-Reranker GGUF 를 쓰거나 코사인 점수화용 임베딩 모델을 쓰세요",
  "doctor.fix.yesno": "모델이 리랭커 프롬프트에 yes/no 로 답하지 않습니다. 채팅 모델이 아닌 Qwen3-Reranker 를 TEMPLATE {{ .Prompt }} 로 가져와 쓰세요",
  "doctor.fix.slow": "--timeout 을 늘리거나 --max-chars 를 줄이거나 더 작은 모델을 쓰세요",
  "doctor.fixLine": "해결 [{n}]: {text}",
  "doctor.nativeRerank": "참고: 이 Ollama 는 이미 /api/rerank 에 답합니다. 브리지는 /v1/rerank 형식과 eval 용으로 계속 쓸모가 있습니다.",
  "doctor.unreachable": "{error}",
  "doctor.summaryOk": "모든 점검을 통과했습니다.",
  "doctor.summaryFail": "점검 {n}건이 실패했습니다.",

  "eval.title": "eval: 모델 {model}, k={k}, 질의 {queries}개, 문서 {docs}개",
  "eval.col.method": "방법",
  "eval.col.ms": "시간 (ms)",
  "eval.m.original": "원래 순서",
  "eval.m.embedding": "임베딩 코사인",
  "eval.m.naive": "소문자만 보는 logprobs",
  "eval.m.bridge": "브리지 logprobs",
  "eval.note.same": "naive 와 bridge 는 같은 Ollama 응답을 쓰므로 시간이 같습니다. naive 는 정확히 yes/no 소문자 토큰만 읽습니다.",
  "eval.note.mock": "이 숫자는 실제 모델이 아니라 연습용 목에서 나온 것입니다. 실제 품질은 내 모델로 실행해 보세요.",
  "eval.note.real": "숫자는 모델·하드웨어·데이터에 따라 달라집니다.",
};
