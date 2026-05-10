# Topic Generation Tests

These scripts exercise the topic generation API exposed at `/api/topic-generation`.

## Files

- `quality.ps1` runs one pass across generated quality cases.
- `stress.ps1` repeatedly runs `quality.ps1` and aggregates the results.
- `run-quality.bat` and `run-stress.bat` are Windows launchers for the PowerShell scripts.
- `reports/` stores generated and archived JSON reports.

## Usage

Start the backend first, then run one of:

```powershell
.\backend\tests\topic-generation\quality.ps1
.\backend\tests\topic-generation\stress.ps1 -Iterations 10
```

Use `-BaseUrl`, `-Mode`, `-CaseLimit`, and `-ReportPath` to override the defaults.
