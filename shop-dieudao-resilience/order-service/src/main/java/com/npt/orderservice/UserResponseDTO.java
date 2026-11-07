package com.npt.orderservice;

//public record UserResponseDTO (Long id, String name, String address) { usages
//}
////UserResponseDTO dto = new UserReponseDTO (1L, "An", "1 Lê Lợi");
////class style readonly, new, và ko có hàm set()
public class UserResponseDTO {
    private Long id;
    private String name;
    private String address;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public UserResponseDTO(Long id, String name, String address) {
        this.id = id;
        this.name = name;
        this.address = address;
    }
}