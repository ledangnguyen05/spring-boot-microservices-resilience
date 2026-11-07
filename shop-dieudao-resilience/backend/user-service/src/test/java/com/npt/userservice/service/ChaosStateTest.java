package com.npt.userservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ChaosStateTest {

    private ChaosState chaosState;

    @BeforeEach
    void setUp() {
        chaosState = new ChaosState();
        chaosState.reset();
    }

    @Test
    @DisplayName("Ban đầu ChaosState phải ở trạng thái bình thường (không lỗi, không delay)")
    void testInitialState() {
        assertEquals(0, chaosState.getDelayMs());
        assertEquals(0, chaosState.getFailPercent());
        assertEquals(0, chaosState.getFailFirstN());
        assertEquals(0, chaosState.getTotalCalls());
        assertFalse(chaosState.shouldFail());
    }

    @Test
    @DisplayName("Cấu hình failFirstN=2: 2 lần đầu shouldFail trả về true, lần 3 trả về false")
    void testFailFirstN() {
        chaosState.configure(null, null, 2);
        assertEquals(2, chaosState.getFailFirstN());

        assertTrue(chaosState.shouldFail(), "Lần 1 phải lỗi");
        assertTrue(chaosState.shouldFail(), "Lần 2 phải lỗi");
        assertFalse(chaosState.shouldFail(), "Lần 3 phải thành công");
        assertEquals(0, chaosState.getFailFirstN());
    }

    @Test
    @DisplayName("Cấu hình failPercent=100 thì luôn luôn trả về lỗi")
    void testFailPercent100() {
        chaosState.configure(null, 100, null);
        for (int i = 0; i < 5; i++) {
            assertTrue(chaosState.shouldFail());
        }
    }

    @Test
    @DisplayName("Cấu hình delayMs thì getDelayMs trả về đúng giá trị")
    void testDelayMs() {
        chaosState.configure(2500L, null, null);
        assertEquals(2500L, chaosState.getDelayMs());
    }

    @Test
    @DisplayName("Reset phải xóa hết delay, failPercent, failFirstN và totalCalls")
    void testReset() {
        chaosState.configure(1000L, 50, 3);
        chaosState.nextCall();
        chaosState.reset();

        assertEquals(0, chaosState.getDelayMs());
        assertEquals(0, chaosState.getFailPercent());
        assertEquals(0, chaosState.getFailFirstN());
        assertEquals(0, chaosState.getTotalCalls());
    }
}

