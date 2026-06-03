import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { AuthenticatedUser } from '../auth/types';

type ExportType = 'overview' | 'attendance' | 'demographics';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private getUser(req: Request): AuthenticatedUser {
    return req.user as AuthenticatedUser;
  }

  @Get('overview')
  async overview(@Req() req: Request, @Query('blockId') blockId?: string) {
    const data = await this.reports.overview(this.getUser(req), blockId);
    return { success: true, data };
  }

  @Get('attendance')
  async attendance(
    @Req() req: Request,
    @Query('blockId') blockId?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? Math.max(1, Math.min(20, parseInt(limit, 10))) : 6;
    const data = await this.reports.attendance(
      this.getUser(req),
      blockId,
      lim,
    );
    return { success: true, data };
  }

  @Get('demographics')
  async demographics(@Req() req: Request, @Query('blockId') blockId?: string) {
    const data = await this.reports.demographics(this.getUser(req), blockId);
    return { success: true, data };
  }

  @Get('ward-performance')
  async wardPerformance(
    @Req() req: Request,
    @Query('blockId') blockId?: string,
  ) {
    const data = await this.reports.wardPerformance(
      this.getUser(req),
      blockId,
    );
    return { success: true, data };
  }

  @Get('top-members')
  async topMembers(
    @Req() req: Request,
    @Query('blockId') blockId?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? Math.max(1, Math.min(50, parseInt(limit, 10))) : 10;
    const data = await this.reports.topMembers(
      this.getUser(req),
      blockId,
      lim,
    );
    return { success: true, data };
  }

  /**
   * GET /reports/export?blockId=&type=overview|attendance|demographics
   * Streams a PDF straight to the response. Phase 3 keeps the layout
   * tabular (no chart rendering); Phase 4 will swap in a puppeteer-based
   * visual export of the same React page.
   */
  @Get('export')
  async exportPdf(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: ExportType,
    @Query('blockId') blockId?: string,
  ) {
    const validTypes: ExportType[] = ['overview', 'attendance', 'demographics'];
    if (!type || !validTypes.includes(type)) {
      throw new BadRequestException(
        `type must be one of ${validTypes.join(', ')}`,
      );
    }
    const user = this.getUser(req);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `JanSeva report: ${type}`,
        Author: 'JanSeva',
        CreationDate: new Date(),
      },
    });

    const filename = `janseva-${type}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    doc.pipe(res);

    // ----- Header strip -----
    doc
      .fillColor('#087EA4')
      .rect(0, 0, doc.page.width, 70)
      .fill();
    doc
      .fillColor('#ffffff')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('JanSeva', 48, 26);
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Report — ${type.toUpperCase()}    ·    Generated ${new Date().toLocaleString(
          'en-IN',
        )}`,
        48,
        48,
      );

    doc.moveDown(2);
    doc.fillColor('#23272F');

    // ----- Body per type -----
    if (type === 'overview') {
      const o = await this.reports.overview(user, blockId);
      doc.fontSize(14).font('Helvetica-Bold').text('Overview', 48, 100);
      doc.moveDown();

      const rows: [string, string][] = [
        ['Total members', o.totalMembers.toLocaleString('en-IN')],
        ['Active members', o.activeMembers.toLocaleString('en-IN')],
        ['Pending members', o.pendingMembers.toLocaleString('en-IN')],
        ['Total wards', o.totalWards.toLocaleString('en-IN')],
        ['Total booths', o.totalBooths.toLocaleString('en-IN')],
        ['Active booth workers', o.activeBoothWorkers.toLocaleString('en-IN')],
        ['New this month', o.newThisMonth.toLocaleString('en-IN')],
        ['New last month', o.newLastMonth.toLocaleString('en-IN')],
        ['Growth %', `${o.growthPercent}%`],
        ['Messages sent this month', o.messagesThisMonth.toLocaleString('en-IN')],
        ['Avg. attendance % (last 6 events)', `${o.avgAttendancePercent}%`],
      ];
      this.drawTable(doc, rows);
    } else if (type === 'attendance') {
      const list = await this.reports.attendance(user, blockId, 12);
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Attendance trend (latest 12 events)', 48, 100);
      doc.moveDown();

      const rows: [string, string, string, string, string][] = list.map(
        (a) => [
          a.eventName.slice(0, 32),
          new Date(a.date).toLocaleDateString('en-IN'),
          a.invited.toLocaleString('en-IN'),
          a.attended.toLocaleString('en-IN'),
          `${a.turnout}%`,
        ],
      );
      this.drawWideTable(
        doc,
        ['Event', 'Date', 'Invited', 'Present', 'Turnout'],
        rows,
      );
    } else {
      const d = await this.reports.demographics(user, blockId);
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Demographics', 48, 100);
      doc.moveDown();

      const rows: [string, string][] = [
        ['Gender — Male', d.gender.MALE.toLocaleString('en-IN')],
        ['Gender — Female', d.gender.FEMALE.toLocaleString('en-IN')],
        ['Gender — Other', d.gender.OTHER.toLocaleString('en-IN')],
        ['Age 18-35', d.age['18-35'].toLocaleString('en-IN')],
        ['Age 36-55', d.age['36-55'].toLocaleString('en-IN')],
        ['Age 55+', d.age['55+'].toLocaleString('en-IN')],
        ['Age unknown', d.age.unknown.toLocaleString('en-IN')],
        ['Category — General', d.category.GENERAL.toLocaleString('en-IN')],
        ['Category — OBC', d.category.OBC.toLocaleString('en-IN')],
        ['Category — SC', d.category.SC.toLocaleString('en-IN')],
        ['Category — ST', d.category.ST.toLocaleString('en-IN')],
        ['Status — Active', d.status.ACTIVE.toLocaleString('en-IN')],
        ['Status — Pending', d.status.PENDING.toLocaleString('en-IN')],
        ['Status — Inactive', d.status.INACTIVE.toLocaleString('en-IN')],
      ];
      this.drawTable(doc, rows);
    }

    // ----- Footer strip -----
    doc
      .fontSize(8)
      .fillColor('#99A1AD')
      .text(
        'Confidential · Generated by JanSeva Constituency Management',
        48,
        doc.page.height - 30,
      );

    doc.end();
  }

  /** Two-column key/value table with alternating row tint. */
  private drawTable(doc: PDFKit.PDFDocument, rows: [string, string][]) {
    const startX = 48;
    const colWidth = doc.page.width - 96;
    let y = doc.y;
    const rowH = 22;

    rows.forEach((r, i) => {
      if (y + rowH > doc.page.height - 50) {
        doc.addPage();
        y = 48;
      }
      if (i % 2 === 0) {
        doc
          .rect(startX, y, colWidth, rowH)
          .fillColor('#F6F7F9')
          .fill();
      }
      doc
        .fillColor('#5E6773')
        .font('Helvetica')
        .fontSize(10)
        .text(r[0], startX + 10, y + 6, { width: colWidth * 0.65 });
      doc
        .fillColor('#23272F')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(r[1], startX + colWidth * 0.65, y + 6, {
          width: colWidth * 0.35 - 10,
          align: 'right',
        });
      y += rowH;
    });
    doc.y = y + 10;
  }

  /** Multi-column table with header row. */
  private drawWideTable(
    doc: PDFKit.PDFDocument,
    headers: string[],
    rows: string[][],
  ) {
    const startX = 48;
    const colWidth = (doc.page.width - 96) / headers.length;
    let y = doc.y;
    const rowH = 20;

    // Header
    doc.rect(startX, y, colWidth * headers.length, rowH).fillColor('#087EA4').fill();
    headers.forEach((h, i) => {
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(h, startX + i * colWidth + 6, y + 6, {
          width: colWidth - 12,
        });
    });
    y += rowH;

    // Body
    rows.forEach((r, i) => {
      if (y + rowH > doc.page.height - 50) {
        doc.addPage();
        y = 48;
      }
      if (i % 2 === 0) {
        doc
          .rect(startX, y, colWidth * headers.length, rowH)
          .fillColor('#F6F7F9')
          .fill();
      }
      r.forEach((cell, j) => {
        doc
          .fillColor('#23272F')
          .font('Helvetica')
          .fontSize(9)
          .text(cell, startX + j * colWidth + 6, y + 6, {
            width: colWidth - 12,
          });
      });
      y += rowH;
    });
    doc.y = y + 10;
  }
}
