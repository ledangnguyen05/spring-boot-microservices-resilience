package com.npt.userservice.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI userOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("User Service & Chaos Simulator API")
                        .description("API cung cấp thông tin người dùng và bộ điều khiển Chaos Injection để kiểm thử Resilience (Timeout, Retry, Bulkhead, CircuitBreaker)")
                        .version("1.0.0"));
    }
}

