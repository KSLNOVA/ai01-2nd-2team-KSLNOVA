import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

# DB 파일 경로
DB_PATH = Path(__file__).parent / "exercise_records.db"


def init_db():
    """데이터베이스 초기화 및 테이블 생성"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exercise_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            exercise_type TEXT NOT NULL,
            reps INTEGER NOT NULL,
            duration REAL NOT NULL,
            video_path TEXT,
            summary_report TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 기존 테이블에 summary_report 컬럼이 없으면 추가
    try:
        cursor.execute("ALTER TABLE exercise_sessions ADD COLUMN summary_report TEXT")
    except sqlite3.OperationalError:
        pass  # 이미 컬럼이 존재함
    
    conn.commit()
    conn.close()
    print(f"✅ 데이터베이스 초기화 완료: {DB_PATH}")


def save_exercise_record(
    date: str,
    exercise_type: str,
    reps: int,
    duration: float,
    video_path: str = None,
    summary_report: str = None
) -> int:
    """운동 기록 저장
    
    Args:
        date: 운동 날짜 (YYYY-MM-DD 형식)
        exercise_type: 운동 종류 (예: 'squat')
        reps: 운동 횟수
        duration: 운동 시간 (초 단위)
        video_path: 영상 파일 경로
        summary_report: 종합 피드백 리포트
    
    Returns:
        int: 저장된 레코드의 ID
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO exercise_sessions (date, exercise_type, reps, duration, video_path, summary_report)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (date, exercise_type, reps, duration, video_path, summary_report))
    
    record_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    print(f"✅ 운동 기록 저장 완료 (ID: {record_id})")
    return record_id


def get_all_records(limit: int = 100) -> List[Dict]:
    """모든 운동 기록 조회
    
    Args:
        limit: 조회할 최대 레코드 수
    
    Returns:
        List[Dict]: 운동 기록 리스트
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Dict 형태로 반환
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM exercise_sessions
        ORDER BY created_at DESC
        LIMIT ?
    """, (limit,))
    
    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return records


def get_records_by_date(date: str) -> List[Dict]:
    """특정 날짜의 운동 기록 조회
    
    Args:
        date: 조회할 날짜 (YYYY-MM-DD 형식)
    
    Returns:
        List[Dict]: 해당 날짜의 운동 기록 리스트
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM exercise_sessions
        WHERE date = ?
        ORDER BY created_at DESC
    """, (date,))
    
    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return records


def get_records_by_exercise(exercise_type: str, limit: int = 50) -> List[Dict]:
    """특정 운동 종류의 기록 조회
    
    Args:
        exercise_type: 운동 종류
        limit: 조회할 최대 레코드 수
    
    Returns:
        List[Dict]: 해당 운동의 기록 리스트
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM exercise_sessions
        WHERE exercise_type = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (exercise_type, limit))
    
    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return records


def get_statistics(exercise_type: Optional[str] = None) -> Dict:
    """운동 통계 조회
    
    Args:
        exercise_type: 특정 운동 종류 (None이면 전체)
    
    Returns:
        Dict: 통계 정보 (총 세션 수, 총 횟수, 총 시간 등)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    if exercise_type:
        cursor.execute("""
            SELECT 
                COUNT(*) as total_sessions,
                SUM(reps) as total_reps,
                SUM(duration) as total_duration,
                AVG(reps) as avg_reps,
                AVG(duration) as avg_duration
            FROM exercise_sessions
            WHERE exercise_type = ?
        """, (exercise_type,))
    else:
        cursor.execute("""
            SELECT 
                COUNT(*) as total_sessions,
                SUM(reps) as total_reps,
                SUM(duration) as total_duration,
                AVG(reps) as avg_reps,
                AVG(duration) as avg_duration
            FROM exercise_sessions
        """)
    
    row = cursor.fetchone()
    conn.close()
    
    return {
        "total_sessions": row[0] or 0,
        "total_reps": row[1] or 0,
        "total_duration": row[2] or 0,
        "avg_reps": round(row[3], 1) if row[3] else 0,
        "avg_duration": round(row[4], 1) if row[4] else 0
    }


def delete_record(record_id: int) -> bool:
    """운동 기록 삭제
    
    Args:
        record_id: 삭제할 레코드 ID
    
    Returns:
        bool: 삭제 성공 여부
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM exercise_sessions WHERE id = ?", (record_id,))
    
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return deleted


# 서버 시작 시 DB 초기화
if __name__ == "__main__":
    init_db()
    print("데이터베이스가 준비되었습니다!")
