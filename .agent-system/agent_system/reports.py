from __future__ import annotations

import json
from pathlib import Path

from .security import redact


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def write_report(run_dir: Path, report: dict) -> None:
    # Logs/prompt bruto de CLI não são persistidos: podem conter tokens/PII.
    safe = json.loads(redact(json.dumps(report, ensure_ascii=False)))
    write_json(run_dir / "report.json", safe)
    lines = ["# Relatório da execução", "", f"- Estado: **{safe['status']}**", f"- Modelo: `{safe.get('model', 'n/a')}`", f"- Snapshot: `{safe.get('snapshot_digest', 'n/a')}`", f"- Duração: {safe.get('elapsed_seconds', 0):.2f}s", f"- Chamadas Cloud: {safe.get('cloud_calls', 0)}", f"- Correções: {safe.get('corrections', 0)}", f"- Aprovação Cloud: {safe.get('cloud_approved')}", "", "A aplicação principal não recebe alterações automaticamente. O diff e o workspace estão nesta pasta.", "", "## Verificações", "", "| Check | Resultado | Evidência |", "| --- | --- | --- |"]
    for check in safe.get("checks", []):
        detail = check["details"].replace("|", "\\|").replace("\n", " ")[:1500]
        lines.append(f"| {check['name']} | {check['status']} | {detail} |")
    lines += ["", "## Métricas", "", "```json", json.dumps(safe.get("metrics", {}), ensure_ascii=False, indent=2), "```", "", "## Limitações", "", "Métricas não fornecidas pelo runtime permanecem null. VRAM mede uso da placa inteira, incluindo outros processos; não comprova distribuição do modelo. Cópias de arquivos não são sandbox de processos. Filtros de conteúdo não substituem a revisão de dados antes do envio Cloud."]
    if safe.get("error"):
        lines += ["", "## Interrupção", "", safe["error"]]
    (run_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
