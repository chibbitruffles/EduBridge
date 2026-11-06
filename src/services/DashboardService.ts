import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * DashboardService - Business logic for dashboard and progress tracking.
 * All student-specific data is scoped to the authenticated user's ID.
 * Admin dashboard shows only system-level aggregates.
 */
export class DashboardService {
  /**
   * Get dashboard data for the authenticated user.
   * Returns role-specific information: categories, recent activities,
   * notification summary, and quick stats.
   */
  static async getDashboard(userId: string, userRole: 'STUDENT' | 'ADMIN') {
    if (userRole === 'ADMIN') {
      return this.getAdminDashboard(userId);
    }

    return this.getStudentDashboard(userId);
  }

  /**
   * Get student dashboard data.
   */
  private static async getStudentDashboard(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppErrorClass('User not found', 404);
    }

    const categories = await db.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            materials: { where: { isPublished: true, isArchived: false } },
            quizzes: { where: { isPublished: true, isArchived: false } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    const [recentAttempts, recentBookmarks, recentNotifications] =
      await Promise.all([
        db.quizAttempt.findMany({
          where: {
            userId,
            status: { in: ['submitted', 'graded'] },
            score: { not: null },
          },
          select: {
            id: true,
            completedAt: true,
            submittedAt: true,
            startedAt: true,
            quiz: { select: { id: true, title: true } },
          },
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
        db.bookmark.findMany({
          where: { userId },
          select: {
            id: true,
            createdAt: true,
            material: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        db.notification.findMany({
          where: {
            OR: [
              { userId },
              { userId: null },
            ],
          },
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    const [personalTotal, personalUnread, broadcastTotal] =
      await Promise.all([
        db.notification.count({ where: { userId } }),
        db.notification.count({ where: { userId, isRead: false } }),
        db.notification.count({ where: { userId: null } }),
      ]);

    const allAttempts = await db.quizAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        quizId: true,
        score: true,
        status: true,
        quiz: { select: { passingScore: true } },
      },
    });

    const completedAttempts = allAttempts.filter(
      (a) =>
        (a.status === 'submitted' || a.status === 'graded') &&
        a.score !== null
    );
    const pendingAttemptsCount = allAttempts.filter(
      (a) => a.status === 'in_progress'
    ).length;

    const scoredAttempts = completedAttempts.filter((a) => a.score !== null);
    const totalQuizzesTaken = new Set(
      scoredAttempts.map((a) => a.quizId)
    ).size;

    const averageScore =
      scoredAttempts.length > 0
        ? Math.round(
            scoredAttempts.reduce(
              (sum, a) => sum + (a.score ?? 0),
              0
            ) / scoredAttempts.length
          )
        : null;

    const passRate =
      completedAttempts.length > 0
        ? Math.round(
            completedAttempts.filter(
              (a) =>
                (a.score ?? 0) >=
                (a.quiz.passingScore ?? 60)
            ).length /
              completedAttempts.length *
              100
          )
        : null;

    const recentActivities = this.mergeRecentActivities(
      recentAttempts,
      recentBookmarks,
      recentNotifications
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        memberSince: user.createdAt,
      },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        materialCount: c._count.materials,
        quizCount: c._count.quizzes,
      })),
      recentActivities,
      notificationSummary: {
        personalTotal,
        personalUnread,
        broadcastTotal,
      },
      quickStats: {
        totalQuizzesTaken,
        averageScore,
        passRate,
        pendingAttempts: pendingAttemptsCount,
      },
    };
  }

  /**
   * Get admin dashboard data (system-level only, no student PII).
   */
  private static async getAdminDashboard(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new AppErrorClass('Admin access required', 403);
    }

    const categories = await db.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            materials: { where: { isPublished: true, isArchived: false } },
            quizzes: { where: { isPublished: true, isArchived: false } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    const [totalQuizzes, totalMaterials, totalUsers, totalAttempts] =
      await Promise.all([
        db.quiz.count(),
        db.learningMaterial.count(),
        db.user.count(),
        db.quizAttempt.count(),
      ]);

    const [recentQuizzes, recentMaterials] = await Promise.all([
      db.quiz.findMany({
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.learningMaterial.findMany({
        where: { isPublished: true, isArchived: false },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const [personalTotal, personalUnread] = await Promise.all([
      db.notification.count({ where: { userId } }),
      db.notification.count({ where: { userId, isRead: false } }),
    ]);

    const recentActivities = [
      ...recentQuizzes.map((q) => ({
        id: q.id,
        type: 'quiz_created' as const,
        title: q.title,
        createdAt: q.createdAt,
        referenceId: q.id,
      })),
      ...recentMaterials.map((m) => ({
        id: m.id,
        type: 'material_published' as const,
        title: m.title,
        createdAt: m.createdAt,
        referenceId: m.id,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        memberSince: user.createdAt,
      },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        materialCount: c._count.materials,
        quizCount: c._count.quizzes,
      })),
      systemStats: {
        totalQuizzes,
        totalMaterials,
        totalUsers,
        totalAttempts,
      },
      recentActivities,
      notificationSummary: {
        personalTotal,
        personalUnread,
      },
    };
  }

  /**
   * Get progress tracking data for the authenticated student.
   */
  static async getProgress(userId: string) {
    const allAttempts = await db.quizAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        quizId: true,
        score: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const availableQuizzes = await db.quiz.findMany({
      where: { isPublished: true, isArchived: false },
      select: { id: true, categoryId: true },
    });

    const completedAttempts = allAttempts.filter(
      (a) =>
        (a.status === 'submitted' || a.status === 'graded') &&
        a.score !== null
    );
    const inProgressAttempts = allAttempts.filter(
      (a) => a.status === 'in_progress'
    );
    const totalAttempts = allAttempts.length;

    const scoredAttempts = completedAttempts.filter((a) => a.score !== null);

    const averageScore =
      scoredAttempts.length > 0
        ? Math.round(
            scoredAttempts.reduce(
              (sum, a) => sum + (a.score ?? 0),
              0
            ) / scoredAttempts.length
          )
        : null;

    const passRate =
      completedAttempts.length > 0
        ? Math.round(
            completedAttempts.filter(
              (a) =>
                (a.score ?? 0) >= (a.quiz.passingScore ?? 60)
            ).length /
              completedAttempts.length *
              100
          )
        : null;

    const highestScore =
      scoredAttempts.length > 0
        ? Math.max(...scoredAttempts.map((a) => a.score ?? 0))
        : null;

    const lowestScore =
      scoredAttempts.length > 0
        ? Math.min(...scoredAttempts.map((a) => a.score ?? 0))
        : null;

    // Progress by category
    const categoryProgressMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        totalQuizzes: number;
        completedQuizzes: Set<string>;
        completedScores: number[];
        passingScores: number[];
      }
    >();

    availableQuizzes.forEach((q) => {
      categoryProgressMap.set(q.categoryId, {
        categoryId: q.categoryId,
        categoryName: '',
        totalQuizzes: 0,
        completedQuizzes: new Set(),
        completedScores: [],
        passingScores: [],
      });
    });

    // Count total quizzes per category
    for (const q of availableQuizzes) {
      const cat = categoryProgressMap.get(q.categoryId);
      if (cat) {
        cat.totalQuizzes += 1;
        // Fetch category name lazily - we need to get it from the quiz relation
        // Since we didn't include category name, we'll populate it below
      }
    }

    // Mark completed quizzes per category
    for (const a of completedAttempts) {
      const catId = a.quiz.category.id;
      const cat = categoryProgressMap.get(catId);
      if (cat) {
        cat.completedQuizzes.add(a.quizId);
        cat.completedScores.push(a.score ?? 0);
        cat.passingScores.push(a.quiz.passingScore ?? 60);
      }
    }

    // Fetch category names for all categories in the map
    const categoryIds = Array.from(categoryProgressMap.keys());
    const categories = await db.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryNameMap = new Map(
      categories.map((c) => [c.id, c.name])
    );

    const progressByCategory = Array.from(
      categoryProgressMap.values()
    ).filter((cat) => cat.completedQuizzes.size > 0).map((cat) => {
      const completedCount = cat.completedQuizzes.size;
      const avgScore =
        cat.completedScores.length > 0
          ? Math.round(
              cat.completedScores.reduce(
                (sum, s) => sum + s,
                0
              ) / cat.completedScores.length
            )
          : null;
      const passCount = cat.completedScores.filter(
        (s, i) => s >= cat.passingScores[i]
      ).length;
      const passRate =
        cat.completedScores.length > 0
          ? Math.round((passCount / cat.completedScores.length) * 100)
          : null;

      return {
        categoryId: cat.categoryId,
        categoryName: categoryNameMap.get(cat.categoryId) || '',
        totalQuizzes: cat.totalQuizzes,
        completedQuizzes: completedCount,
        averageScore: avgScore,
        passRate,
      };
    });

    // Recent quiz activity (both submitted and graded)
    const recentQuizActivity = allAttempts.map((a) => ({
      attemptId: a.id,
      quizId: a.quizId,
      quizTitle: a.quiz.title,
      score: a.score,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      completedAt: a.completedAt,
    }));

    return {
      quizStatistics: {
        totalAttempts,
        completedAttempts: completedAttempts.length,
        inProgressAttempts: inProgressAttempts.length,
        averageScore,
        passRate,
        highestScore,
        lowestScore,
      },
      progressByCategory,
      recentQuizActivity,
    };
  }

  /**
   * Merge and sort recent activities from different sources.
   */
  private static mergeRecentActivities(
    attempts: Array<{
      id: string;
      completedAt: Date | null;
      submittedAt: Date | null;
      startedAt: Date;
      quiz: { id: string; title: string };
    }>,
    bookmarks: Array<{
      id: string;
      createdAt: Date;
      material: { id: string; title: string };
    }>,
    notifications: Array<{
      id: string;
      title: string;
      createdAt: Date;
    }>
  ) {
    const activities: Array<{
      id: string;
      type: string;
      title: string;
      createdAt: Date;
      referenceId: string;
    }> = [];

    for (const a of attempts) {
      const timestamp = a.completedAt ?? a.submittedAt ?? a.startedAt;
      activities.push({
        id: a.id,
        type: 'quiz_completed',
        title: a.quiz.title,
        createdAt: timestamp,
        referenceId: a.quiz.id,
      });
    }

    for (const b of bookmarks) {
      activities.push({
        id: b.id,
        type: 'material_bookmarked',
        title: b.material.title,
        createdAt: b.createdAt,
        referenceId: b.material.id,
      });
    }

    for (const n of notifications) {
      activities.push({
        id: n.id,
        type: 'notification_received',
        title: n.title,
        createdAt: n.createdAt,
        referenceId: n.id,
      });
    }

    activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return activities.slice(0, 10);
  }
}
