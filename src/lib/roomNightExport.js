import { getWeekdayLabel, parseLocalDateString } from './dates.js';

export const formatExportRangeLabel = (startDate, endDate) => {
  const start = parseLocalDateString(startDate);
  const end = parseLocalDateString(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Room Nights';
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

export const escapeSpreadsheetXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const sanitizeWorksheetName = (name) => {
  const sanitized = String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  return sanitized || 'Sheet';
};

export const buildRoomNightWorkbookXml = ({ sheets = [] }) => {
  const renderCell = (cell = {}) => {
    const styleId = cell.styleId || 'Default';
    if (cell.value === null || cell.value === undefined || cell.value === '') {
      return `<Cell ss:StyleID="${styleId}"/>`;
    }
    const type = cell.type || (typeof cell.value === 'number' ? 'Number' : 'String');
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${escapeSpreadsheetXml(cell.value)}</Data></Cell>`;
  };

  const renderRow = (cells = []) => `<Row>${cells.map(renderCell).join('')}</Row>`;

  const worksheetXml = sheets.map((sheet) => {
    const titleRow = renderRow([
      { value: sheet.title || sheet.name || 'Room Nights', styleId: 'Title' },
      ...(sheet.days || []).map((dateStr) => ({ value: getWeekdayLabel(dateStr), styleId: 'Header' })),
    ]);

    const dayRow = renderRow([
      { value: 'Day', styleId: 'Header' },
      ...(sheet.days || []).map((dateStr) => ({ value: parseLocalDateString(dateStr).getDate(), type: 'Number', styleId: 'Header' })),
    ]);

    const roomRows = (sheet.rows || []).map((row) => renderRow([
      { value: row.label, styleId: 'RowLabel' },
      ...(row.values || []).map((value) => (
        value === null || value === undefined
          ? { value: '', styleId: 'BlankCell' }
          : { value, type: 'Number', styleId: 'CurrencyCell' }
      )),
    ])).join('');

    const occupancyRow = renderRow([
      { value: 'Occ%', styleId: 'RowLabel' },
      ...(sheet.occupancy || []).map((value) => ({ value, styleId: 'PercentCell' })),
    ]);

    const columns = [
      '<Column ss:AutoFitWidth="0" ss:Width="120"/>',
      ...(sheet.days || []).map(() => '<Column ss:AutoFitWidth="0" ss:Width="74"/>'),
    ].join('');

    return `
      <Worksheet ss:Name="${escapeSpreadsheetXml(sanitizeWorksheetName(sheet.name || 'Sheet'))}">
        <Table>
          ${columns}
          ${titleRow}
          ${dayRow}
          ${roomRows}
          ${occupancyRow}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <FreezePanes/>
          <FrozenNoSplit/>
          <SplitHorizontal>2</SplitHorizontal>
          <TopRowBottomPane>2</TopRowBottomPane>
          <SplitVertical>1</SplitVertical>
          <LeftColumnRightPane>1</LeftColumnRightPane>
        </WorksheetOptions>
      </Worksheet>
    `;
  }).join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Calibri" ss:Size="11"/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/>
      <Interior ss:Color="#EAF0E6" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
      <Interior ss:Color="#F4F4F5" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="RowLabel">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="CurrencyCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="BlankCell">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="PercentCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;
};
