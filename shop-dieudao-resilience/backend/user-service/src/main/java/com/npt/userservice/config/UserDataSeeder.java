package com.npt.userservice.config;

import com.npt.userservice.entity.User;
import com.npt.userservice.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class UserDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(UserDataSeeder.class);
    private final UserRepository userRepository;

    public UserDataSeeder(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(String... args) {
        if (userRepository.count() == 0) {
            List<User> sampleUsers = List.of(
                    new User("Nguyễn Phúc Thành", "thanh.nguyen@example.com", "0901234567", "1 Lê Lợi, Quận 1, TP. HCM"),
                    new User("Trần Thị Mai", "mai.tran@example.com", "0912345678", "12 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội"),
                    new User("Lê Hoàng Nam", "nam.le@example.com", "0923456789", "45 Nguyễn Huệ, Quận 1, TP. HCM"),
                    new User("Phạm Minh Tuấn", "tuan.pham@example.com", "0934567890", "78 Cầu Giấy, Cầu Giấy, Hà Nội"),
                    new User("Hoàng Thu Thảo", "thao.hoang@example.com", "0945678901", "23 Bạch Đằng, Hải Châu, Đà Nẵng"),
                    new User("Vũ Đức Anh", "anh.vu@example.com", "0956789012", "89 Hùng Vương, Hồng Bàng, Hải Phòng"),
                    new User("Đặng Kim Ngân", "ngan.dang@example.com", "0967890123", "56 Nguyễn Văn Linh, Ninh Kiều, Cần Thơ"),
                    new User("Bùi Gia Huy", "huy.bui@example.com", "0978901234", "102 Phan Chu Trinh, TP. Huế"),
                    new User("Đỗ Phương Linh", "linh.do@example.com", "0989012345", "34 Quang Trung, TP. Vinh"),
                    new User("Ngô Quốc Bảo", "bao.ngo@example.com", "0990123456", "67 Lê Duẩn, Buôn Ma Thuột")
            );

            userRepository.saveAll(sampleUsers);
            log.info(">>> Seeded {} users into H2 Database successfully!", sampleUsers.size());
        }
    }
}

